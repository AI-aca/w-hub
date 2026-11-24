// 권한 계산: 원장은 전부. 나머지는 memberships(작업공간 × 영역 × 단계 × 센터)
import type { Tx } from "./db.ts";
import type { Me } from "./auth.ts";
import { fail } from "./util.ts";

export type Role = "owner" | "admin" | "editor" | "viewer";
export type Need = Exclude<Role, "owner">;
export const ROLE_RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3, owner: 4 };

export interface AreaAccess { role: Role; center_ids: number[] | null }
/** workspace_id → area → 권한 */
export type AccessMap = Record<string, Record<string, AreaAccess>>;

export async function accessMap(tx: Tx, me: Me): Promise<AccessMap> {
  const map: AccessMap = {};
  if (me.is_owner) {
    for (const a of await tx`select workspace_id, area from core.workspace_areas`) {
      (map[a.workspace_id] ??= {})[a.area] = { role: "owner", center_ids: null };
    }
    return map;
  }
  for (const m of await tx`select workspace_id, area, role, center_ids from core.memberships where email = ${me.email}`) {
    (map[m.workspace_id] ??= {})[m.area] = {
      role: m.role as Role,
      center_ids: m.center_ids ? (m.center_ids as (number | string)[]).map(Number) : null,
    };
  }
  return map;
}

/** 영역 권한 검사: 단계가 충분한지. 영역을 여럿 주면 그중 하나라도 되면 통과. 센터 범위는 돌려받은 center_ids 로 각 액션이 거른다. */
export async function requireArea(tx: Tx, me: Me, ws: string, area: string | string[], need: Need): Promise<AreaAccess> {
  const mine = (await accessMap(tx, me))[ws] ?? {};
  const have = (Array.isArray(area) ? area : [area]).map((x) => mine[x]).filter((x): x is AreaAccess => !!x);
  if (!have.length) fail("이 영역을 쓸 권한이 없습니다.", 403, "forbidden");
  const a = have.find((x) => ROLE_RANK[x.role] >= ROLE_RANK[need]);
  if (!a) fail("이 작업을 할 권한이 없습니다.", 403, "forbidden");
  return a!;
}

/** 센터 하나가 범위 안인지(center_ids=null 이면 전체) */
export function inCenters(a: AreaAccess, centerId: number | null): boolean {
  if (!a.center_ids) return true;
  return centerId != null && a.center_ids.includes(centerId);
}
