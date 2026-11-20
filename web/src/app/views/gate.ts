// 로그인 전 화면: 로그인 / 승인 대기 / 차단
import { html } from "lit-html";
import { ref } from "lit-html/directives/ref.js";
import { renderGoogleButton } from "../../core/google";
import { state } from "../state";

export interface GateActions { onCredential: (c: string) => void; onRetry: () => void }

const brand = html`<div class="gate-brand"><span class="logo">W</span><div><b>W-HUB</b><small>입시관리 통합 플랫폼</small></div></div>`;

export function loginView(a: GateActions, message?: string) {
  const mount = (el?: Element) => {
    if (!el || (el as HTMLElement).dataset.done) return;
    (el as HTMLElement).dataset.done = "1";
    if (!state.clientId) { el.textContent = "구글 로그인 설정이 아직 없습니다. 관리자에게 문의하세요."; return; }
    renderGoogleButton(el as HTMLElement, state.clientId, a.onCredential).catch((e) => { el.textContent = e.message; });
  };
  return html`<main class="gate">
    <section class="gate-card">
      ${brand}
      <h1>로그인</h1>
      <p class="muted">승인된 구글 계정으로 로그인합니다.</p>
      ${message ? html`<p class="gate-msg">${message}</p>` : ""}
      <div class="gbtn" ${ref(mount)}></div>
      <p class="hint">처음 로그인하면 원장님 승인 후 사용할 수 있습니다.</p>
    </section>
  </main>`;
}

export function pendingView(email: string, a: GateActions) {
  return html`<main class="gate">
    <section class="gate-card">
      ${brand}
      <h1>승인 대기 중</h1>
      <p><b>${email}</b> 계정으로 승인 요청을 보냈습니다.</p>
      <p class="muted">원장님이 승인하면 다시 로그인해 주세요.</p>
      <button class="btn" @click=${a.onRetry}>다른 계정으로 로그인</button>
    </section>
  </main>`;
}

export function blockedView(email: string, a: GateActions) {
  return html`<main class="gate">
    <section class="gate-card">
      ${brand}
      <h1>접근이 허용되지 않은 계정</h1>
      <p><b>${email}</b> 계정은 사용할 수 없습니다.</p>
      <button class="btn" @click=${a.onRetry}>다른 계정으로 로그인</button>
    </section>
  </main>`;
}

export const loadingView = () => html`<main class="gate"><div class="spinner" aria-label="불러오는 중"></div></main>`;
