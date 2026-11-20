// 앱 상태와 화면 다시 그리기
import type { MeResponse } from "../core/types";

export type Phase =
  | { kind: "loading" }
  | { kind: "login"; message?: string }
  | { kind: "pending"; email: string }
  | { kind: "blocked"; email: string }
  | { kind: "ready"; me: MeResponse };

export const state: { phase: Phase; clientId: string; pendingCount: number } = {
  phase: { kind: "loading" },
  clientId: "",
  pendingCount: 0,
};

let redraw: () => void = () => {};
export const setRedraw = (f: () => void) => { redraw = f; };
export const update = () => redraw();

const LAST_WS = "whub_last_ws";
export const lastWorkspace = {
  get(): string { try { return localStorage.getItem(LAST_WS) ?? ""; } catch { return ""; } },
  set(v: string): void { try { localStorage.setItem(LAST_WS, v); } catch { /* 무시 */ } },
};
