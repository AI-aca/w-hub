// 화면 전체가 공유하는 상태. 각 영역 화면(View)은 이것만 받는다.
import type { TemplateResult } from "lit-html";
import type { AreaAccess, Center, MeResp, Role } from "../shared/core/types";
import { ROLE_RANK } from "../shared/core/types";
import type { Route } from "../shared/core/route";

export interface App {
  me: MeResp;
  ws: string;
  route: Route;
  redraw(): void;
  reloadMe(): Promise<void>;
}
/** 왼쪽(범위·목록·하단 버튼) + 오른쪽 작업 영역 */
export interface View { side?: TemplateResult; main: TemplateResult }

export const centersOf = (app: App, ws = app.ws): Center[] => app.me.centers.filter((c) => c.workspace_id === ws);
export const accessOf = (app: App, area: string, ws = app.ws): AreaAccess | undefined => app.me.access[ws]?.[area];
export const can = (app: App, area: string, need: Exclude<Role, "owner">): boolean => {
  const a = accessOf(app, area);
  return !!a && ROLE_RANK[a.role] >= ROLE_RANK[need];
};
/** 내가 볼 수 있는 센터(권한에 센터 제한이 있으면 그 센터만) */
export const myCenters = (app: App, area: string): Center[] => {
  const ids = accessOf(app, area)?.center_ids;
  return centersOf(app).filter((c) => !ids || ids.includes(c.id));
};
