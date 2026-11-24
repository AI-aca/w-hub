// 로그인 · 승인 대기 · 차단 화면
import { html, render } from "lit-html";
import { renderGoogleButton } from "../shared/core/google";
import { errMsg } from "../shared/ui/ui";

export type GateState = { kind: "login" } | { kind: "pending"; email: string } | { kind: "blocked"; email: string } | { kind: "noarea"; email: string } | { kind: "error"; msg: string };

export function renderGate(root: HTMLElement, st: GateState, clientId: string, onCredential: (c: string) => void, onBack: () => void): void {
  const box = (h: string, p: unknown, extra: unknown = "") => html`<div class="gatepage"><div class="gatebox">
    <div class="mark">W</div><h1>${h}</h1><p>${p}</p>${extra}</div></div>`;
  if (st.kind === "login") {
    render(box("로그인", html`와이즈만·연세국제 선생님용 통합 사이트입니다.<br>학원 구글 계정으로 로그인하세요.`, html`<div class="gbtn" id="gbtn"></div>`), root);
    const el = root.querySelector<HTMLElement>("#gbtn")!;
    renderGoogleButton(el, clientId, onCredential).catch((e) => { el.textContent = errMsg(e); });
  } else if (st.kind === "pending") {
    render(box("승인 대기 중", html`<b>${st.email}</b><br>원장님이 승인하면 바로 쓸 수 있습니다.`,
      html`<button class="btn" @click=${onBack}>다른 계정으로 로그인</button>`), root);
  } else if (st.kind === "blocked") {
    render(box("사용할 수 없는 계정", html`<b>${st.email}</b><br>원장님께 문의하세요.`,
      html`<button class="btn" @click=${onBack}>다른 계정으로 로그인</button>`), root);
  } else if (st.kind === "noarea") {
    render(box("아직 맡은 업무가 없습니다", html`<b>${st.email}</b><br>원장님이 쓸 영역(학생·성적·수업…)을 정해 주면 메뉴가 나타납니다.`,
      html`<button class="btn" @click=${onBack}>로그아웃</button>`), root);
  } else {
    render(box("연결 오류", st.msg, html`<button class="btn" @click=${() => location.reload()}>다시 시도</button>`), root);
  }
}
