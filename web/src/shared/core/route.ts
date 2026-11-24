// 주소: #/<작업공간>/<메뉴>/<세부...>   예) #/weiz/students/<id>, #/weiz/admin/users
export interface Route { ws: string; menu: string; parts: string[] }

export function parseRoute(hash = location.hash): Route {
  const p = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  return { ws: p[0] ?? "", menu: p[1] ?? "home", parts: p.slice(2) };
}
export const href = (ws: string, menu: string, ...parts: string[]) =>
  "#/" + [ws, menu, ...parts].map(encodeURIComponent).join("/");
export const go = (ws: string, menu: string, ...parts: string[]) => { location.hash = href(ws, menu, ...parts); };
