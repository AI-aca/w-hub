// 작은 공용 도구: 알림, 날짜 표기, 확인창
export function toast(msg: string, kind: "ok" | "err" | "info" = "info"): void {
  const box = document.getElementById("toasts");
  if (!box) return;
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.classList.add("out"), kind === "err" ? 5000 : 2600);
  setTimeout(() => el.remove(), kind === "err" ? 5400 : 3000);
}

const pad = (n: number) => String(n).padStart(2, "0");
export function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ago(v: string | null | undefined): string {
  if (!v) return "-";
  const s = (Date.now() - new Date(v).getTime()) / 1000;
  if (s < 90) return "방금";
  if (s < 3600) return `${Math.round(s / 60)}분 전`;
  if (s < 86400) return `${Math.round(s / 3600)}시간 전`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}일 전`;
  return fmtDateTime(v).slice(0, 10);
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
