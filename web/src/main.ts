// W-HUB 시작점: 로그인 확인 → 뼈대 → 주소(#/작업공간/메뉴/…)에 맞는 화면
import "./shared/styles/app.css";
import { render } from "lit-html";
import { api, ApiError, setExpiredHandler, token } from "./shared/core/api";
import { googleSignOut } from "./shared/core/google";
import { href, parseRoute } from "./shared/core/route";
import { setCurrentWs } from "./shared/core/ws";
import type { MeResp } from "./shared/core/types";
import { errMsg, toast } from "./shared/ui/ui";
import type { App, View } from "./shell/app";
import { renderGate } from "./shell/gate";
import { layout, visibleMenus } from "./shell/layout";
import { homeView, resetHome } from "./areas/home/view";
import { studentsView } from "./areas/students/view";
import { adminView } from "./areas/admin/view";

const root = document.getElementById("app")!;
const VIEWS: Record<string, (app: App) => View> = { home: homeView, students: studentsView, admin: adminView };
const WS_KEY = "whub_ws";

let clientId = "";
let app: App | null = null;

function gate(st: Parameters<typeof renderGate>[1]): void {
  app = null;
  renderGate(root, st, clientId, onCredential, () => { if (st.kind === "noarea") { void logout(); return; } googleSignOut(); gate({ kind: "login" }); });
}

async function onCredential(credential: string): Promise<void> {
  try {
    const r = await api<{ ok: boolean; token?: string; state?: "pending" | "blocked"; email?: string }>("login", { credential });
    if (r.token) { token.set(r.token); await start(); } else gate({ kind: r.state ?? "pending", email: r.email ?? "" });
  } catch (e) {
    if (e instanceof ApiError && e.code === "pending") return;
    toast(errMsg(e), "bad");
  }
}

async function logout(): Promise<void> {
  try { await api("logout"); } catch { /* 무시 */ }
  token.clear(); googleSignOut(); resetHome();
  gate({ kind: "login" });
}

function draw(): void {
  if (!app) return;
  const r = parseRoute();
  const wsIds = app.me.workspaces.map((w) => w.id);
  if (!wsIds.includes(r.ws)) {
    let saved = "";
    try { saved = localStorage.getItem(WS_KEY) ?? ""; } catch { /* 무시 */ }
    location.replace(href(wsIds.includes(saved) ? saved : wsIds[0], "home"));
    return;
  }
  try { localStorage.setItem(WS_KEY, r.ws); } catch { /* 무시 */ }
  if (r.menu === "home" && (app.route.menu !== "home" || app.ws !== r.ws)) resetHome();
  app.ws = r.ws; app.route = r; setCurrentWs(r.ws);
  document.body.classList.toggle("yonsei", r.ws === "yonsei");
  const allowed = visibleMenus(app).map((m) => m.key);
  if (!allowed.includes(r.menu) || !VIEWS[r.menu]) { location.replace(href(r.ws, "home")); return; }
  render(layout(app, VIEWS[r.menu](app), logout), root);
}

async function loadMe(): Promise<MeResp> {
  return await api<MeResp>("me");
}

async function start(): Promise<void> {
  const me = await loadMe();
  if (!me.workspaces.length) { gate({ kind: "noarea", email: me.user.email }); return; }
  app = { me, ws: "", route: parseRoute(), redraw: () => draw(), reloadMe: async () => { if (app) { app.me = await loadMe(); draw(); } } };
  draw();
}

async function boot(): Promise<void> {
  setExpiredHandler(() => { token.clear(); toast("로그인이 만료되었습니다. 다시 로그인해 주세요.", "bad"); gate({ kind: "login" }); });
  window.addEventListener("hashchange", draw);
  try {
    clientId = (await api<{ google_client_id: string }>("config")).google_client_id;
  } catch (e) { gate({ kind: "error", msg: errMsg(e) }); return; }
  if (!token.get()) { gate({ kind: "login" }); return; }
  try { await start(); } catch (e) {
    if (e instanceof ApiError && e.status === 401) { token.clear(); gate({ kind: "login" }); } else gate({ kind: "error", msg: errMsg(e) });
  }
}

void boot();
