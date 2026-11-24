// 관리(원장 전용): 계정·영역 권한·센터·학교·강사·기록
import type { Tx } from "../../lib/db.ts";
import { log } from "../../lib/audit.ts";
import { defineAction } from "../../lib/registry.ts";
import { email as cleanEmail, fail, str } from "../../lib/util.ts";

type B = Record<string, unknown>;
const STATUS = ["approved", "pending", "blocked"] as const;
const ROLES = ["admin", "editor", "viewer"] as const;
const STATUS_KO: Record<string, string> = { approved: "승인", pending: "승인 대기", blocked: "차단" };
const ROLE_KO: Record<string, string> = { admin: "관리", editor: "입력", viewer: "열람" };

async function needWs(tx: Tx, ws: string): Promise<void> {
  const [w] = await tx`select id from core.workspaces where id = ${ws}`;
  if (!w) fail("없는 작업공간입니다.");
}
const int = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : d);
const dup = (e: unknown, msg: string) => {
  if ((e as { code?: string }).code === "23505") fail(msg);
  throw e;
};

export default [
  defineAction({
    name: "userList", who: "owner",
    run: async ({ tx }) => {
      const users = await tx`
        select u.email, u.name, u.is_owner, u.status, u.created_at, u.last_login,
               (select max(s.last_seen) from core.sessions s where s.email = u.email) as last_seen,
               coalesce((select json_agg(json_build_object('workspace_id', m.workspace_id, 'area', m.area,
                          'role', m.role, 'center_ids', m.center_ids) order by m.workspace_id, m.area)
                         from core.memberships m where m.email = u.email), '[]'::json) as memberships
        from core.users u
        order by case u.status when 'pending' then 0 when 'approved' then 1 else 2 end, u.is_owner desc, u.name, u.email`;
      const areas = await tx`select workspace_id, area, name, sort, ready, uses_centers from core.workspace_areas order by workspace_id, sort`;
      const workspaces = await tx`select id, name, sort from core.workspaces order by sort`;
      const centers = await tx`select id::int as id, workspace_id, name, sort, active from org.centers order by sort, name`;
      return { ok: true, users, areas, workspaces, centers };
    },
  }),

  /** 계정 저장(없으면 등록). 영역 권한은 통째로 바꾼다. 한 사람이 여러 영역을 가질 수 있다. */
  defineAction({
    name: "userSave", who: "owner",
    run: async ({ tx, body: b, me }) => {
      const email = cleanEmail(b.email);
      const name = str(b.name, 60);
      const status = (STATUS as readonly string[]).includes(String(b.status)) ? String(b.status) : "approved";
      const isOwner = b.is_owner === true;
      if (email === me.email && (!isOwner || status !== "approved")) fail("자기 자신의 원장 권한·승인 상태는 바꿀 수 없습니다.");

      const areas = await tx`select workspace_id, area, uses_centers from core.workspace_areas`;
      const cens = await tx`select id::int as id, workspace_id, name from org.centers`;
      const list = Array.isArray(b.memberships) ? b.memberships.slice(0, 100) : [];
      const rows: { workspace_id: string; area: string; role: string; center_ids: number[] | null }[] = [];
      const seen = new Set<string>();
      for (const raw of list as B[]) {
        const ws = str(raw.workspace_id, 20), ar = str(raw.area, 30), role = String(raw.role);
        const def = areas.find((a) => a.workspace_id === ws && a.area === ar);
        if (!def) fail(`없는 영역입니다: ${ws}/${ar}`);
        if (!(ROLES as readonly string[]).includes(role)) fail("권한 단계가 올바르지 않습니다.");
        if (seen.has(ws + "/" + ar)) continue;
        seen.add(ws + "/" + ar);
        let centerIds: number[] | null = null;
        if (def!.uses_centers && Array.isArray(raw.center_ids)) {
          centerIds = [...new Set((raw.center_ids as unknown[]).map(Number))];
          for (const id of centerIds) {
            if (!cens.some((c) => c.id === id && c.workspace_id === ws)) fail("작업공간에 없는 센터입니다.");
          }
          if (centerIds.length === 0) fail("센터를 하나 이상 고르거나 '전체'로 두세요.");
        }
        rows.push({ workspace_id: ws, area: ar, role, center_ids: centerIds });
      }

      const [before] = await tx`select is_owner from core.users where email = ${email}`;
      if (before?.is_owner && !isOwner) {
        const [{ n }] = await tx`select count(*)::int as n from core.users where is_owner and status = 'approved' and email <> ${email}`;
        if (n === 0) fail("원장 계정이 최소 1개는 있어야 합니다.");
      }
      await tx`insert into core.users (email, name, is_owner, status) values (${email}, ${name}, ${isOwner}, ${status})
               on conflict (email) do update set name = excluded.name, is_owner = excluded.is_owner, status = excluded.status`;
      await tx`delete from core.memberships where email = ${email}`;
      for (const r of rows) {
        await tx`insert into core.memberships (email, workspace_id, area, role, center_ids)
                 values (${email}, ${r.workspace_id}, ${r.area}, ${r.role}, ${r.center_ids})`;
      }
      if (status !== "approved") await tx`delete from core.sessions where email = ${email}`;
      const cname = (id: number) => cens.find((c) => c.id === id)?.name ?? String(id);
      await log(tx, me.email, before ? "사용자 변경" : "사용자 등록", {
        email, name, status: STATUS_KO[status], owner: isOwner,
        memberships: rows.map((r) => `${r.workspace_id}/${r.area}:${ROLE_KO[r.role]}${r.center_ids ? "@" + r.center_ids.map(cname).join("+") : ""}`),
      });
      return { ok: true };
    },
  }),

  defineAction({
    name: "userDelete", who: "owner",
    run: async ({ tx, body, me }) => {
      const email = cleanEmail(body.email);
      if (email === me.email) fail("자기 자신은 삭제할 수 없습니다.");
      const [u] = await tx`delete from core.users where email = ${email} returning name`;
      if (!u) fail("없는 계정입니다.", 404, "not_found");
      await log(tx, me.email, "사용자 삭제", { email, name: u.name });
      return { ok: true };
    },
  }),

  // 명부: 센터·학교·강사 -------------------------------------------------
  defineAction({
    name: "orgList", who: "owner",
    run: async ({ tx, ws }) => {
      await needWs(tx, ws);
      const centers = await tx`select id::int as id, name, sort, active from org.centers where workspace_id = ${ws} order by sort, name`;
      const schools = await tx`select id::int as id, center_id::int as center_id, name, level, sort, active
                               from org.schools where workspace_id = ${ws} order by level, sort, name`;
      const staff = await tx`select id, name, email, phone, subjects, memo, active, center_id::int as center_id from org.staff where workspace_id = ${ws} order by active desc, name`;
      return { ok: true, centers, schools, staff };
    },
  }),

  defineAction({
    name: "centerSave", who: "owner",
    run: async ({ tx, body: b, me, ws }) => {
      await needWs(tx, ws);
      const name = str(b.name, 40);
      if (!name) fail("센터 이름을 입력하세요.");
      const sort = int(b.sort), active = b.active !== false;
      try {
        if (b.id != null) {
          const [r] = await tx`update org.centers set name = ${name}, sort = ${sort}, active = ${active}
                               where id = ${int(b.id)} and workspace_id = ${ws} returning id`;
          if (!r) fail("없는 센터입니다.", 404, "not_found");
        } else {
          await tx`insert into org.centers (workspace_id, name, sort, active) values (${ws}, ${name}, ${sort}, ${active})`;
        }
      } catch (e) { dup(e, "같은 이름의 센터가 이미 있습니다."); }
      await log(tx, me.email, "센터 변경", { name, active }, ws);
      return { ok: true };
    },
  }),

  defineAction({
    name: "schoolSave", who: "owner",
    run: async ({ tx, body: b, me, ws }) => {
      await needWs(tx, ws);
      const name = str(b.name, 40);
      const level = String(b.level);
      if (!name) fail("학교 이름을 입력하세요.");
      if (!["초", "중", "고"].includes(level)) fail("학교급은 초·중·고 중 하나입니다.");
      const centerId = b.center_id == null || b.center_id === "" ? null : int(b.center_id);
      if (centerId != null) {
        const [c] = await tx`select id from org.centers where id = ${centerId} and workspace_id = ${ws}`;
        if (!c) fail("작업공간에 없는 센터입니다.");
      }
      const sort = int(b.sort), active = b.active !== false;
      try {
        if (b.id != null) {
          const [r] = await tx`update org.schools set name = ${name}, level = ${level}, center_id = ${centerId}, sort = ${sort}, active = ${active}
                               where id = ${int(b.id)} and workspace_id = ${ws} returning id`;
          if (!r) fail("없는 학교입니다.", 404, "not_found");
        } else {
          await tx`insert into org.schools (workspace_id, center_id, name, level, sort, active)
                   values (${ws}, ${centerId}, ${name}, ${level}, ${sort}, ${active})`;
        }
      } catch (e) { dup(e, "같은 센터에 같은 이름의 학교가 이미 있습니다."); }
      await log(tx, me.email, "학교 변경", { name, level, active }, ws);
      return { ok: true };
    },
  }),

  defineAction({
    name: "staffSave", who: "owner",
    run: async ({ tx, body: b, me, ws }) => {
      await needWs(tx, ws);
      const name = str(b.name, 40);
      if (!name) fail("이름을 입력하세요.");
      const em = str(b.email, 200) ? cleanEmail(b.email) : null;
      if (em) {
        const [u] = await tx`select email from core.users where email = ${em}`;
        if (!u) fail("등록된 계정의 이메일만 연결할 수 있습니다. 먼저 사용자에 등록하세요.");
      }
      const subjects = Array.isArray(b.subjects) ? (b.subjects as unknown[]).map((s) => str(s, 20)).filter(Boolean).slice(0, 10) : [];
      const phone = str(b.phone, 30), memo = str(b.memo, 500), active = b.active !== false;
      const centerId = b.center_id == null || b.center_id === "" ? null : int(b.center_id);
      if (centerId != null) {
        const [c] = await tx`select name from org.centers where id = ${centerId} and workspace_id = ${ws}`;
        if (!c) fail("작업공간에 없는 센터입니다.");
      }
      try {
        if (b.id) {
          const [r] = await tx`update org.staff set name = ${name}, email = ${em}, phone = ${phone}, subjects = ${subjects},
                                 memo = ${memo}, active = ${active}, center_id = ${centerId}, updated_at = now()
                               where id = ${str(b.id, 40)} and workspace_id = ${ws} returning id`;
          if (!r) fail("없는 강사입니다.", 404, "not_found");
        } else {
          await tx`insert into org.staff (workspace_id, name, email, phone, subjects, memo, active, center_id)
                   values (${ws}, ${name}, ${em}, ${phone}, ${subjects}, ${memo}, ${active}, ${centerId})`;
        }
      } catch (e) { dup(e, "같은 이름의 강사가 이미 있습니다."); }
      await log(tx, me.email, "강사 변경", { name, active, center_id: centerId }, ws);
      return { ok: true };
    },
  }),

  defineAction({
    name: "logList", who: "owner",
    run: async ({ tx, body: b }) => {
      const q = str(b.q, 60);
      const act = str(b.filter_action, 30);
      const like = "%" + q.replace(/[\\%_]/g, (m) => "\\" + m) + "%";
      const rows = await tx`
        select l.id::int as id, l.at, l.email, coalesce(u.name, '') as name, l.workspace_id, l.area, l.action, l.detail
        from core.audit_log l left join core.users u on u.email = l.email
        where (${act} = '' or l.action = ${act})
          and (${q} = '' or l.email ilike ${like} or u.name ilike ${like} or l.detail::text ilike ${like})
        order by l.at desc limit 500`;
      const actions = await tx`select distinct action from core.audit_log order by 1`;
      return { ok: true, rows, actions: actions.map((a) => a.action) };
    },
  }),
];
