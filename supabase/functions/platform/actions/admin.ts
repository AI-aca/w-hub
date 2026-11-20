// 관리(원장 전용): 계정·권한·센터·로그
import { db } from "../lib/db.ts";
import { requireOwner, requireUser } from "../lib/auth.ts";
import { log } from "../lib/audit.ts";
import { email as cleanEmail, fail, str } from "../lib/util.ts";

type B = Record<string, unknown>;
const STATUS = ["approved", "pending", "blocked"] as const;
const ROLES = ["admin", "editor", "viewer"] as const;
const STATUS_KO: Record<string, string> = { approved: "승인", pending: "승인 대기", blocked: "차단" };
const ROLE_KO: Record<string, string> = { admin: "관리자", editor: "입력자", viewer: "열람" };

export const adminActions = {
  userList: (b: B) => db(async (tx) => {
    requireOwner(await requireUser(tx, b.token));
    const users = await tx`
      select u.email, u.name, u.is_owner, u.status, u.created_at, u.last_login,
             (select max(s.last_seen) from core.sessions s where s.email = u.email) as last_seen,
             coalesce((select json_agg(json_build_object('workspace_id', m.workspace_id, 'module_key', m.module_key,
                        'role', m.role, 'center_ids', m.center_ids) order by m.workspace_id, m.module_key)
                       from core.memberships m where m.email = u.email), '[]'::json) as memberships
      from core.users u
      order by case u.status when 'pending' then 0 when 'approved' then 1 else 2 end, u.is_owner desc, u.name, u.email`;
    const modules = await tx`select workspace_id, module_key, name, sort, uses_centers from core.workspace_modules order by sort`;
    const workspaces = await tx`select id, name, sort from core.workspaces order by sort`;
    const centers = await tx`select id::int as id, workspace_id, name, sort, active from core.centers order by sort, name`;
    return { ok: true, users, modules, workspaces, centers };
  }),

  /** 계정 저장(없으면 새로 등록). memberships 는 통째로 바꾼다. */
  userSave: (b: B) => db(async (tx) => {
    const me = await requireUser(tx, b.token);
    requireOwner(me);
    const email = cleanEmail(b.email);
    const name = str(b.name, 60);
    const status = (STATUS as readonly string[]).includes(String(b.status)) ? String(b.status) : "approved";
    const isOwner = b.is_owner === true;
    if (email === me.email && (!isOwner || status !== "approved")) fail("자기 자신의 원장 권한·승인 상태는 바꿀 수 없습니다.");

    const mods = await tx`select workspace_id, module_key, uses_centers from core.workspace_modules`;
    const cens = await tx`select id::int as id, workspace_id, name from core.centers`;
    const list = Array.isArray(b.memberships) ? b.memberships.slice(0, 50) : [];
    const rows: { workspace_id: string; module_key: string; role: string; center_ids: number[] | null }[] = [];
    const seen = new Set<string>();
    for (const raw of list as B[]) {
      const ws = str(raw.workspace_id, 20), mk = str(raw.module_key, 30), role = String(raw.role);
      const mod = mods.find((m) => m.workspace_id === ws && m.module_key === mk);
      if (!mod) fail(`없는 모듈입니다: ${ws}/${mk}`);
      if (!(ROLES as readonly string[]).includes(role)) fail("권한 단계가 올바르지 않습니다.");
      if (seen.has(ws + "/" + mk)) continue;
      seen.add(ws + "/" + mk);
      let centerIds: number[] | null = null;
      if (mod!.uses_centers && Array.isArray(raw.center_ids)) {
        centerIds = [...new Set((raw.center_ids as unknown[]).map(Number))];
        for (const id of centerIds) {
          if (!cens.some((c) => c.id === id && c.workspace_id === ws)) fail("작업공간에 없는 센터입니다.");
        }
        if (centerIds.length === 0) fail("센터를 하나 이상 고르거나 '전체'로 두세요.");
      }
      rows.push({ workspace_id: ws, module_key: mk, role, center_ids: centerIds });
    }

    const [before] = await tx`select is_owner, status from core.users where email = ${email}`;
    if (before?.is_owner && !isOwner) {
      const [{ n }] = await tx`select count(*)::int as n from core.users where is_owner and status = 'approved' and email <> ${email}`;
      if (n === 0) fail("원장 계정이 최소 1개는 있어야 합니다.");
    }
    await tx`insert into core.users (email, name, is_owner, status) values (${email}, ${name}, ${isOwner}, ${status})
             on conflict (email) do update set name = excluded.name, is_owner = excluded.is_owner, status = excluded.status`;
    await tx`delete from core.memberships where email = ${email}`;
    for (const r of rows) {
      await tx`insert into core.memberships (email, workspace_id, module_key, role, center_ids)
               values (${email}, ${r.workspace_id}, ${r.module_key}, ${r.role}, ${r.center_ids})`;
    }
    if (status !== "approved") await tx`delete from core.sessions where email = ${email}`;

    const cname = (id: number) => cens.find((c) => c.id === id)?.name ?? String(id);
    await log(tx, me.email, before ? "사용자 변경" : "사용자 등록", {
      email, name, status: STATUS_KO[status], owner: isOwner,
      memberships: rows.map((r) => `${r.workspace_id}/${r.module_key}:${ROLE_KO[r.role]}${r.center_ids ? "@" + r.center_ids.map(cname).join("+") : ""}`),
    });
    return { ok: true };
  }),

  userDelete: (b: B) => db(async (tx) => {
    const me = await requireUser(tx, b.token);
    requireOwner(me);
    const email = cleanEmail(b.email);
    if (email === me.email) fail("자기 자신은 삭제할 수 없습니다.");
    const [u] = await tx`delete from core.users where email = ${email} returning name`;
    if (!u) fail("없는 계정입니다.", 404, "not_found");
    await log(tx, me.email, "사용자 삭제", { email, name: u.name });
    return { ok: true };
  }),

  centerSave: (b: B) => db(async (tx) => {
    const me = await requireUser(tx, b.token);
    requireOwner(me);
    const ws = str(b.workspace_id, 20);
    const name = str(b.name, 40);
    if (!name) fail("센터 이름을 입력하세요.");
    const [w] = await tx`select id from core.workspaces where id = ${ws}`;
    if (!w) fail("없는 작업공간입니다.");
    const sort = Number.isFinite(Number(b.sort)) ? Math.trunc(Number(b.sort)) : 0;
    const active = b.active !== false;
    try {
      if (b.id != null) {
        const [r] = await tx`update core.centers set name = ${name}, sort = ${sort}, active = ${active}
                             where id = ${Number(b.id)} and workspace_id = ${ws} returning id`;
        if (!r) fail("없는 센터입니다.", 404, "not_found");
      } else {
        await tx`insert into core.centers (workspace_id, name, sort, active) values (${ws}, ${name}, ${sort}, ${active})`;
      }
    } catch (e) {
      if ((e as { code?: string }).code === "23505") fail("같은 이름의 센터가 이미 있습니다.");
      throw e;
    }
    await log(tx, me.email, "센터 변경", { workspace: ws, name, active }, ws);
    return { ok: true };
  }),

  logList: (b: B) => db(async (tx) => {
    requireOwner(await requireUser(tx, b.token));
    const q = str(b.q, 60);
    const action = str(b.filter_action, 30); // 요청의 action 은 함수 이름이므로 다른 이름을 쓴다
    const like = "%" + q.replace(/[\\%_]/g, (m) => "\\" + m) + "%";
    const rows = await tx`
      select l.id::int as id, l.at, l.email, coalesce(u.name, '') as name, l.workspace_id, l.module_key, l.action, l.detail
      from core.audit_log l left join core.users u on u.email = l.email
      where (${action} = '' or l.action = ${action})
        and (${q} = '' or l.email ilike ${like} or u.name ilike ${like} or l.detail::text ilike ${like})
      order by l.at desc limit 500`;
    const actions = await tx`select distinct action from core.audit_log order by 1`;
    return { ok: true, rows, actions: actions.map((a) => a.action) };
  }),
};
