// 뼈대: 상단(로고·작업공간 전환·메뉴·내 계정) + 왼쪽 3구역 + 오른쪽 작업 영역
import { html, nothing, type TemplateResult } from "lit-html";
import { ADMIN_MENU, MENUS, type MenuDef } from "../shared/core/menu";
import { href } from "../shared/core/route";
import type { App, View } from "./app";

/** 이 사람이 이 작업공간에서 볼 수 있는 메뉴 */
export function visibleMenus(app: App): MenuDef[] {
  const acc = app.me.access[app.ws] ?? {};
  const ready = new Set(app.me.areas.filter((a) => a.workspace_id === app.ws && a.ready).map((a) => a.area));
  const out = MENUS.filter((m) => m.key === "home" || m.areas.some((a) => acc[a] && ready.has(a)));
  if (app.me.user.is_owner) out.push(ADMIN_MENU);
  return out;
}

let popOpen = false;

export function layout(app: App, view: View, onLogout: () => void): TemplateResult {
  const menus = visibleMenus(app);
  const wss = app.me.workspaces;
  const u = app.me.user;
  return html`
  <header class="top">
    <a class="logo" href=${href(app.ws, "home")} style="text-decoration:none;color:inherit"><i>W</i>W-HUB</a>
    ${wss.length > 1 ? html`<div class="ws ws-switch" role="tablist">${wss.map((w) => html`
      <button role="tab" class=${w.id === app.ws ? "on" : ""} aria-selected=${w.id === app.ws}
        @click=${() => { location.hash = href(w.id, "home"); }}>${w.name}</button>`)}</div>`
      : html`<span class="chip" style="margin-right:12px">${wss[0]?.name}</span>`}
    <nav class="menu" aria-label="메뉴">${menus.map((m) => html`
      <a href=${href(app.ws, m.key)} class=${m.key === app.route.menu ? "on" : ""}>${m.name}</a>`)}</nav>
    <div class="sp"></div>
    <div class="me">
      <button @click=${() => { popOpen = !popOpen; app.redraw(); }} aria-label="내 계정"><i style="width:30px;height:30px;border-radius:50%;background:#e5e7eb;display:grid;place-items:center;font-style:normal;color:var(--ink2);font-size:12px">${(u.name || u.email)[0]}</i>${u.name || u.email}</button>
      ${popOpen ? html`<div class="pop"><div class="em">${u.email}${u.is_owner ? html`<br><span class="chip info" style="margin-top:6px">원장</span>` : nothing}</div>
        <button class="btn wide" @click=${() => { popOpen = false; onLogout(); }}>로그아웃</button></div>` : nothing}
    </div>
  </header>
  <div class="body">
    ${view.side ? html`<aside class="side">${view.side}</aside>` : nothing}
    <main class="main">${view.main}</main>
  </div>`;
}

/** 작업 영역 머리(경로·제목·칩·버튼) + 탭 */
export function head(o: { crumb?: string; title: string | TemplateResult; chips?: TemplateResult; actions?: TemplateResult; tabs?: { key: string; label: string; href?: string; off?: boolean }[]; tab?: string }): TemplateResult {
  return html`<div class="head" style=${o.tabs ? "" : "padding-bottom:14px"}>
    ${o.crumb ? html`<div class="crumb">${o.crumb}</div>` : nothing}
    <div class="hrow"><h1 class="title" style="margin:0">${o.title}</h1>${o.chips ?? nothing}<div class="sp"></div>${o.actions ?? nothing}</div>
    ${o.tabs ? html`<div class="tabs" role="tablist">${o.tabs.map((t) => t.off
      ? html`<a class="off" title="준비 중">${t.label}<span class="soon">준비 중</span></a>`
      : html`<a role="tab" href=${t.href ?? "#"} class=${t.key === o.tab ? "on" : ""}>${t.label}</a>`)}</div>` : nothing}
  </div>`;
}
