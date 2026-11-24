// 모든 서버 요청은 여기서 정의한다. 권한 검사는 액션마다 손으로 쓰지 않고 선언(who)으로 한다.
//   who: "public"  로그인 없이(설정·로그인)
//        "user"    로그인한 승인 계정
//        "owner"   원장만(계정·권한·로그·명부 관리)
//        { area, need }  작업공간(body.ws)의 그 영역에 need 이상 권한(area 가 배열이면 그중 하나)
import type { Tx } from "./db.ts";
import { db } from "./db.ts";
import { type Me, requireOwner, requireUser } from "./auth.ts";
import { type AreaAccess, type Need, requireArea } from "./perm.ts";
import { fail, str } from "./util.ts";

export interface Ctx { ip: string; ua: string }
export type Body = Record<string, unknown>;
export type Who = "public" | "user" | "owner" | { area: string | string[]; need: Need };

export interface Run {
  tx: Tx;
  body: Body;
  ctx: Ctx;
  me: Me;          // public 이면 빈 값
  ws: string;      // 영역 액션일 때 작업공간
  access: AreaAccess | null;
}

export interface Action {
  name: string;
  who: Who;
  /** true 면 트랜잭션 없이 run 을 부른다(로그인처럼 여러 트랜잭션이 필요할 때). tx 는 쓰지 않는다. */
  raw?: boolean;
  run: (r: Run) => Promise<unknown>;
}

const NOBODY: Me = { email: "", name: "", is_owner: false };

export function defineAction(a: Action): Action {
  if (!/^[a-z][a-zA-Z0-9]{1,40}$/.test(a.name)) throw new Error(`액션 이름 규칙 위반: ${a.name}`);
  return a;
}

export async function runAction(a: Action, body: Body, ctx: Ctx): Promise<unknown> {
  if (a.raw) {
    if (a.who !== "public") throw new Error("raw 액션은 public 만 가능");
    return await a.run({ tx: null as unknown as Tx, body, ctx, me: NOBODY, ws: "", access: null });
  }
  return await db(async (tx) => {
    if (a.who === "public") return await a.run({ tx, body, ctx, me: NOBODY, ws: "", access: null });
    const me = await requireUser(tx, body.token);
    if (a.who === "user") return await a.run({ tx, body, ctx, me, ws: "", access: null });
    if (a.who === "owner") {
      requireOwner(me);
      return await a.run({ tx, body, ctx, me, ws: str(body.ws, 20), access: null });
    }
    const ws = str(body.ws, 20);
    if (!ws) fail("작업공간이 없습니다.");
    const access = await requireArea(tx, me, ws, a.who.area, a.who.need);
    return await a.run({ tx, body, ctx, me, ws, access });
  });
}
