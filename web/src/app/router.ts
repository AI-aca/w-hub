// 해시 주소: #/w/{작업공간}  ·  #/w/{작업공간}/{모듈}  ·  #/admin/{users|centers|logs}
export type Route =
  | { kind: "home"; ws: string }
  | { kind: "module"; ws: string; module: string }
  | { kind: "admin"; page: "users" | "centers" | "logs" }
  | { kind: "none" };

export function parseRoute(hash = location.hash): Route {
  const p = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (p[0] === "w" && p[1]) return p[2] ? { kind: "module", ws: p[1], module: p[2] } : { kind: "home", ws: p[1] };
  if (p[0] === "admin") {
    const page = p[1] === "centers" || p[1] === "logs" ? p[1] : "users";
    return { kind: "admin", page };
  }
  return { kind: "none" };
}

export const href = {
  home: (ws: string) => `#/w/${encodeURIComponent(ws)}`,
  module: (ws: string, m: string) => `#/w/${encodeURIComponent(ws)}/${encodeURIComponent(m)}`,
  admin: (page: "users" | "centers" | "logs" = "users") => `#/admin/${page}`,
};

export function go(h: string, replace = false): void {
  if (location.hash === h) return;
  if (replace) history.replaceState(null, "", h); else location.hash = h;
  if (replace) window.dispatchEvent(new HashChangeEvent("hashchange"));
}
