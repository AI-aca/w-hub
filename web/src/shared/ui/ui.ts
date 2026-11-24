// 공용 화면 조각: 알림, 대화상자, 날짜
import { html, render, type TemplateResult } from "lit-html";

export function toast(msg: string, kind: "" | "ok" | "bad" = ""): void {
  const box = document.getElementById("toasts");
  if (!box) return;
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), kind === "bad" ? 5000 : 2500);
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** 대화상자 하나를 띄운다. body 는 열려 있는 동안 redraw() 로 다시 그린다. */
export function openDialog(title: string, body: (close: () => void, redraw: () => void) => TemplateResult): { close: () => void; redraw: () => void } {
  const d = document.createElement("dialog");
  d.setAttribute("aria-label", title);
  document.body.appendChild(d);
  const close = () => { d.close(); d.remove(); };
  const redraw = () => render(html`<div class="dh"><h2>${title}</h2><div class="sp"></div>
      <button class="btn sm" @click=${close} aria-label="닫기">✕</button></div>${body(close, redraw)}`, d);
  d.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
  redraw();
  d.showModal();
  return { close, redraw };
}

export function ymd(v: unknown): string {
  if (!v) return "";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function ymdhm(v: unknown): string {
  if (!v) return "";
  const d = new Date(String(v));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${ymd(v)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 확인 창(브라우저 confirm 대신) */
export function ask(title: string, msg: string, okLabel = "확인"): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const fin = (v: boolean, close: () => void) => { if (!done) { done = true; close(); resolve(v); } };
    const d = openDialog(title, (close) => html`<div class="db">${msg}</div>
      <div class="df"><button class="btn" @click=${() => fin(false, close)}>취소</button>
      <button class="btn pri" @click=${() => fin(true, close)}>${okLabel}</button></div>`);
    void d;
  });
}
