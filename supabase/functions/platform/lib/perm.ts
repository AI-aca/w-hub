// 권한 계산: 원장은 전부, 나머지는 memberships 기준
import type { Tx } from "./db.ts";
import type { Me } from "./auth.ts";
import { fail } from "./util.ts";

export type Role = "owner" | "admin" | "editor" | "viewer";
export const ROLE_RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3, owner: 4 };

export interface ModuleAccess { role: Role; center_ids: number[] | null }
/** workspace_id → module_key → 접근 권한 */
export type AccessMap = Record<string, Record<string, ModuleAccess>>;

export async function accessMap(tx: Tx, me: Me): Promise<AccessMap> {
  const map: AccessMap = {};
  if (me.is_owner) {
    for (const m of await tx`select workspace_id, module_key from core.workspace_modules`) {
      (map[m.workspace_id] ??= {})[m.module_key] = { role: "owner", center_ids: null };
    }
    return map;
  }
  for (const m of await tx`select workspace_id, module_key, role, center_ids from core.memberships where email = ${me.email}`) {
    (map[m.workspace_id] ??= {})[m.module_key] = {
      role: m.role as Role,
      center_ids: m.center_ids ? (m.center_ids as (number | string)[]).map(Number) : null,
    };
  }
  return map;
}

/** 모듈 액션에서 쓰는 검사: 필요한 단계 이상인지, 센터가 범위 안인지 */
export async function requireModule(
  tx: Tx, me: Me, workspace: string, module: string, need: Exclude<Role, "owner">, centerId?: number,
): Promise<ModuleAccess> {
  const a = (await accessMap(tx, me))[workspace]?.[module];
  if (!a) fail("이 모듈을 쓸 권한이 없습니다.", 403, "forbidden");
  if (ROLE_RANK[a!.role] < ROLE_RANK[need]) fail("이 작업을 할 권한이 없습니다.", 403, "forbidden");
  if (centerId != null && a!.center_ids && !a!.center_ids.includes(centerId)) fail("담당 센터가 아닙니다.", 403, "forbidden");
  return a!;
}
