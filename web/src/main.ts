// W-HUB 진입점: 로그인 상태 확인 → 셸(상단바 + 화면) 그리기
import { html, render } from "lit-html";
import "./styles/app.css";
import { api, ApiError, setExpiredHandler, token } from "./core/api";
import { googleSignOut } from "./core/google";
import { metaOf } from "./core/modules";
import { ROLE_LABEL, type MeResponse } from "./core/types";
import { errMsg, toast } from "./core/ui";
import { go, href, parseRoute, type Route } from "./app/router";
import { lastWorkspace, setRedraw, state, update } from "./app/state";
import { blockedView, loadingView, loginView, pendingView } from "./app/views/gate";
import { homeView } from "./app/views/home";
import { moduleView } from "./app/views/module";
import { adminView, loadAdmin, loadLogs } from "./app/views/admin";

const root = document.getElementById("app")!;

const gate = {
  onCredential: async (credential: string) => {
    try {
      const r = await api<{ ok: boolean; token?: string; state?: string; email?: string }>("login", { credential });
      if (r.ok && r.token) { token.set(r.token); await loadMe(); return; }
      state.phase = r.state === "blocked" ? { kind: "blocked", email: r.email ?? "" } : { kind: "pending", email: r.email ?? "" };
    } catch (e) {
      state.phase = { kind: "login", message: errMsg(e) };
    }
    update();
  },
  onRetry: () => { googleSignOut(); state.phase = { kind: "login" }; update(); },
};

async function logout(): Promise<void> {
  try { await api("logout"); } catch { /* 이미 끊긴 세션 */ }
  token.clear();
  googleSignOut();
  state.phase = { kind: "login" };
  update();
}

setExpiredHandler(() => {
  token.clear();
  state.phase = { kind: "login", message: "로그인이 만료되었습니다. 다시 로그인해 주세요." };
  update();
});

/** 주소가 권한 밖이면 알맞은 곳으로 보낸다 */
function normalize(me: MeResponse, r: Route): Route {
  const has = (ws: string) => me.workspaces.some((w) => w.id === ws);
  if (r.kind === "admin") return me.user.is_owner ? r : normalize(me, { kind: "none" });
  if ((r.kind === "home" || r.kind === "module") && has(r.ws)) return r;
  const ws = has(lastWorkspace.get()) ? lastWorkspace.get() : me.workspaces[0]?.id;
  return ws ? { kind: "home", ws } : { kind: "none" };
}

function topbar(me: MeResponse, r: Route) {
  const ws = r.kind === "home" || r.kind === "module" ? r.ws : (me.workspaces.find((w) => w.id === lastWorkspace.get()) ?? me.workspaces[0])?.id;
  const mods = me.modules.filter((m) => m.workspace_id === ws);
  const roleText = me.user.is_owner ? ROLE_LABEL.owner : "";
  return html`<header class="topbar">
    <a class="brand" href=${ws ? href.home(ws) : "#"}><span class="logo">W</span><b>W-HUB</b></a>
    ${me.workspaces.length > 1 ? html`<div class="ws-switch" role="tablist" aria-label="작업공간">
      ${me.workspaces.map((w) => html`<button role="tab" aria-selected=${w.id === ws} class=${w.id === ws ? "on" : ""}
        @click=${() => { lastWorkspace.set(w.id); go(href.home(w.id)); }}>${w.name}</button>`)}
    </div>` : me.workspaces[0] ? html`<span class="ws-name">${me.workspaces[0].name}</span>` : ""}
    <nav class="mods">
      ${ws ? html`<a class=${"mod" + (r.kind === "home" ? " on" : "")} href=${href.home(ws)}>홈</a>` : ""}
      ${mods.map((m) => html`<a class=${"mod" + (r.kind === "module" && r.module === m.module_key ? " on" : "")}
        style=${`--accent:${metaOf(m.module_key).accent}`} href=${href.module(m.workspace_id, m.module_key)}>${m.name}</a>`)}
      ${me.user.is_owner ? html`<a class=${"mod admin" + (r.kind === "admin" ? " on" : "")} href=${href.admin("users")}>관리
        ${state.pendingCount ? html`<span class="badge">${state.pendingCount}</span>` : ""}</a>` : ""}
    </nav>
    <div class="me">
      <span class="who"><b>${me.user.name || me.user.email}</b>${roleText ? html`<small>${roleText}</small>` : ""}</span>
      <button class="btn ghost small" @click=${logout}>로그아웃</button>
    </div>
  </header>`;
}

function body(me: MeResponse, r: Route) {
  if (r.kind === "none") return html`<section class="page"><div class="empty big">
    <h2>아직 사용할 수 있는 모듈이 없습니다</h2><p>원장님이 권한을 주시면 여기에 나타납니다.</p></div></section>`;
  if (r.kind === "admin") return adminView(r.page);
  if (r.kind === "module") return moduleView(me, r.ws, r.module);
  return homeView(me, r.ws);
}

let lastAdminPage = "";
function draw(): void {
  const p = state.phase;
  if (p.kind !== "ready") lastAdminPage = "";
  if (p.kind === "loading") { render(loadingView(), root); return; }
  if (p.kind === "login") { render(loginView(gate, p.message), root); return; }
  if (p.kind === "pending") { render(pendingView(p.email, gate), root); return; }
  if (p.kind === "blocked") { render(blockedView(p.email, gate), root); return; }
  const me = p.me;
  const raw = parseRoute();
  const r = normalize(me, raw);
  if (JSON.stringify(r) !== JSON.stringify(raw)) {
    const h = r.kind === "home" ? href.home(r.ws) : r.kind === "module" ? href.module(r.ws, r.module) : r.kind === "admin" ? href.admin(r.page) : "#/";
    if (location.hash !== h) { history.replaceState(null, "", h); }
  }
  if (r.kind === "home" || r.kind === "module") lastWorkspace.set(r.ws);
  // 관리 화면에 들어올 때 자료 불러오기
  const adminKey = r.kind === "admin" ? r.page : "";
  if (adminKey !== lastAdminPage) {
    lastAdminPage = adminKey;
    if (adminKey) { queueMicrotask(() => { if (adminKey === "logs") loadLogs(); else loadAdmin(); }); }
  }
  render(html`<div class="shell">${topbar(me, r)}<main class="content">${body(me, r)}</main></div>`, root);
}

async function loadMe(): Promise<void> {
  try {
    const me = await api<MeResponse>("me");
    state.phase = { kind: "ready", me };
    if (me.user.is_owner) {
      api<{ users: { status: string }[] }>("userList")
        .then((d) => { state.pendingCount = d.users.filter((u) => u.status === "pending").length; update(); })
        .catch(() => {});
    }
  } catch (e) {
    token.clear();
    state.phase = { kind: "login", message: e instanceof ApiError && e.code === "no_session" ? undefined : errMsg(e) };
  }
  update();
}

async function boot(): Promise<void> {
  setRedraw(draw);
  window.addEventListener("hashchange", () => update());
  draw();
  try {
    const c = await api<{ google_client_id: string }>("config");
    state.clientId = c.google_client_id;
  } catch (e) { toast(errMsg(e), "err"); }
  if (token.get()) await loadMe();
  else { state.phase = { kind: "login" }; update(); }
}

boot();
