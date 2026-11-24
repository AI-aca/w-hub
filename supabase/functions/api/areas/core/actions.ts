// 로그인·세션·내 정보
import { db } from "../../lib/db.ts";
import { clientId, createSession, type GoogleId, isBootOwner, verifyGoogle } from "../../lib/auth.ts";
import { accessMap } from "../../lib/perm.ts";
import { log } from "../../lib/audit.ts";
import { defineAction } from "../../lib/registry.ts";
import { fail, sha256, str } from "../../lib/util.ts";

export default [
  defineAction({
    name: "config", who: "public",
    run: async () => ({ ok: true, google_client_id: await clientId() }),
  }),

  /** 구글 ID 토큰으로 로그인. 처음 보는 계정은 승인 대기로 등록한다. */
  defineAction({
    name: "login", who: "public", raw: true,
    run: async ({ body, ctx }) => {
      await db(async (tx) => {
        const [{ n }] = await tx`select count(*)::int as n from core.login_fails where ip = ${ctx.ip} and at > now() - interval '10 minutes'`;
        if (n >= 20) fail("로그인 시도가 너무 많습니다. 10분 뒤에 다시 시도해 주세요.", 429, "rate_limited");
      });
      let g: GoogleId;
      try {
        g = await verifyGoogle(str(body.credential, 4096), await clientId());
      } catch (e) {
        // 실패 기록은 별도 트랜잭션(오류로 되돌려지지 않게)
        await db(async (tx) => {
          await tx`insert into core.login_fails (ip) values (${ctx.ip})`;
          await tx`delete from core.login_fails where at < now() - interval '1 day'`;
        });
        throw e;
      }
      return await db(async (tx) => {
        if (await isBootOwner(g.email)) {
          await tx`insert into core.users (email, name, is_owner, status) values (${g.email}, ${g.name}, true, 'approved')
                   on conflict (email) do update set is_owner = true, status = 'approved'`;
        }
        const [u] = await tx`select email, name, status from core.users where email = ${g.email}`;
        if (!u) {
          await tx`insert into core.users (email, name) values (${g.email}, ${g.name})`;
          await log(tx, g.email, "승인 요청", { name: g.name });
          return { ok: false, state: "pending", email: g.email };
        }
        if (u.status === "pending") return { ok: false, state: "pending", email: g.email };
        if (u.status === "blocked") return { ok: false, state: "blocked", email: g.email };
        await tx`update core.users set last_login = now(), name = case when name = '' then ${g.name} else name end where email = ${g.email}`;
        const token = await createSession(tx, g.email, ctx.ua);
        await log(tx, g.email, "로그인", {});
        return { ok: true, token };
      });
    },
  }),

  defineAction({
    name: "logout", who: "public",
    run: async ({ tx, body }) => {
      const t = str(body.token, 200);
      if (t) {
        const [s] = await tx`delete from core.sessions where token_hash = ${await sha256(t)} returning email`;
        if (s) await log(tx, s.email, "로그아웃", {});
      }
      return { ok: true };
    },
  }),

  /** 내 정보 + 볼 수 있는 작업공간·영역·센터. 화면의 상단 메뉴는 이것만으로 그린다. */
  defineAction({
    name: "me", who: "user",
    run: async ({ tx, me }) => {
      const access = await accessMap(tx, me);
      const wsIds = Object.keys(access);
      const workspaces = await tx`select id, name, sort from core.workspaces where id = any(${wsIds}) order by sort, id`;
      const areas = (await tx`select workspace_id, area, name, sort, ready, uses_centers
                              from core.workspace_areas where workspace_id = any(${wsIds}) order by sort, area`)
        .filter((a) => access[a.workspace_id]?.[a.area]);
      const centers = await tx`select id::int as id, workspace_id, name, sort from org.centers
                               where active and workspace_id = any(${wsIds}) order by sort, name`;
      return { ok: true, user: me, access, workspaces, areas, centers };
    },
  }),
];
