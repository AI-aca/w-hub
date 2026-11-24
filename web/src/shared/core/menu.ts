// 상단 메뉴 = 업무 묶음. 메뉴 하나에 영역(권한 단위) 여러 개가 들어간다.
// 메뉴는 그 사람이 권한을 가진, 완성된(ready) 영역이 하나라도 있을 때만 보인다.
export interface MenuDef { key: string; name: string; areas: string[] }

export const MENUS: MenuDef[] = [
  { key: "home", name: "홈", areas: [] },
  { key: "students", name: "학생", areas: ["students"] },
  { key: "scores", name: "성적", areas: ["scores_mock", "scores_naesin", "scores_weekly", "scores_diag"] },
  { key: "class", name: "수업", areas: ["class"] },
  { key: "admission", name: "입시", areas: ["admission"] },
  { key: "analysis", name: "분석", areas: ["analysis"] },
  { key: "bank", name: "문제은행", areas: ["bank"] },
  { key: "calendar", name: "일정", areas: ["calendar"] },
];
export const ADMIN_MENU: MenuDef = { key: "admin", name: "관리", areas: [] };
