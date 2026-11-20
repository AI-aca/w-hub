// 로그인·세션·내 정보
import { db } from "../lib/db.ts";
import { clientId, createSession, type GoogleId, isBootOwner, requireUser, verifyGoogle } from "../lib/auth.ts";
import { accessMap } from "../lib/perm.ts";
import { log } from "../lib/audit.ts";
import { fail, sha256, str } from "../lib/util.ts";
import type { Ctx } from "../handler.ts";

export const coreActions = {
  /** 로그인 화면에 필요한 공개 설정 */
  config: async () => ({ google_client_id: await clientId() }),

  /** 구글 ID 토큰으로 로그인. 처음 보는 계정은 승인 대기로 등록한다. */
  login: async (b: Record<string, unknown>, c: Ctx) => {
    await db(async (tx) => {
      const [{ n }] = await tx`select count(*)::int as n from core.login_fails where ip = ${c.ip} and at > now() - interval '10 minutes'`;
      if (n >= 20) fail("로그인 시도가 너무 많습니다. 10분 뒤에 다시 시도해 주세요.", 429, "rate_limited");
    });
    const aud = await clientId();
    let g: GoogleId;
    try {
      g = await verifyGoogle(str(b.credential, 4096), aud);
    } catch (e) {
      // 실패 기록은 별도 트랜잭션으로 남긴다(오류로 되돌려지지 않게)
      await db(async (tx) => {
        await tx`insert into core.login_fails (ip) values (${c.ip})`;
        await tx`delete from core.login_fails where at < now() - interval '1 day'`;
      });
      throw e;
    }
    return await db(async (tx) => {
    if (await isBootOwner(g.email)) {
      await tx`insert into core.users (email, name, is_owner, status) values (${g.email}, ${g.name}, true, 'approved')
               on conflict (email) do update set is_owner = true, status = 'approved'`;
    }
    let [u] = await tx`select email, name, is_owner, status from core.users where email = ${g.email}`;
    if (!u) {
      await tx`insert into core.users (email, name) values (${g.email}, ${g.name})`;
      await log(tx, g.email, "승인 요청", { name: g.name });
      return { ok: false, state: "pending", email: g.email };
    }
    if (u.status === "pending") return { ok: false, state: "pending", email: g.email };
    if (u.status === "blocked") return { ok: false, state: "blocked", email: g.email };
    if (!u.name && g.name) {
      await tx`update core.users set name = ${g.name} where email = ${g.email}`;
      u = { ...u, name: g.name };
    }
    await tx`update core.users set last_login = now() where email = ${g.email}`;
    const token = await createSession(tx, g.email, c.ua);
    await log(tx, g.email, "로그인", {});
    return { ok: true, token };
    });
  },

  logout: (b: Record<string, unknown>) => db(async (tx) => {
    const t = str(b.token, 200);
    if (t) {
      const [s] = await tx`delete from core.sessions where token_hash = ${await sha256(t)} returning email`;
      if (s) await log(tx, s.email, "로그아웃", {});
    }
    return { ok: true };
  }),

  /** 내 정보 + 내가 볼 수 있는 작업공간·모듈·센터 */
  me: (b: Record<string, unknown>) => db(async (tx) => {
    const me = await requireUser(tx, b.token);
    const access = await accessMap(tx, me);
    const wsIds = Object.keys(access);
    const workspaces = await tx`select id, name, sort from core.workspaces where id = any(${wsIds}) order by sort, id`;
    const modules = (await tx`select workspace_id, module_key, name, sort, ready, uses_centers
                             from core.workspace_modules where workspace_id = any(${wsIds}) order by sort, module_key`)
      .filter((m) => access[m.workspace_id]?.[m.module_key]);
    const centers = await tx`select id::int as id, workspace_id, name, sort from core.centers
                             where active and workspace_id = any(${wsIds}) order by sort, name`;
    return { ok: true, user: me, access, workspaces, modules, centers };
  }),
};
