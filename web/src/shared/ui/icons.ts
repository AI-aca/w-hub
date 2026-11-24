// 왼쪽 메뉴 아이콘(선 그림, 24×24). 접힌 메뉴에서는 아이콘만 보이고 이름은 마우스를 올리면 나온다.
import { html, nothing, svg, type TemplateResult } from "lit-html";

const P: Record<string, string> = {
  dashboard: "M3 3h7v9H3z M14 3h7v5h-7z M14 12h7v9h-7z M3 16h7v5H3z",
  tasks: "M9 11l3 3 8-8 M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9",
  grid: "M3 3h18v18H3z M3 9h18 M3 15h18 M9 3v18 M15 3v18",
  calendar: "M4 5h16v16H4z M4 10h16 M8 3v4 M16 3v4",
  sigma: "M18 4H6l6 8-6 8h12",
  flask: "M9 3h6 M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3 M7 15h10",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M12 2v3 M12 19v3 M4.9 4.9L7 7 M17 17l2.1 2.1 M2 12h3 M19 12h3 M4.9 19.1L7 17 M17 7l2.1-2.1",
  pencil: "M4 20h4L19 9l-4-4L4 16z M14 6l4 4",
  bars: "M4 20V10 M10 20V4 M16 20v-7 M21 20H3",
  trend: "M3 17l6-6 4 4 8-8 M14 7h7v7",
  sliders: "M4 6h9 M17 6h3 M15 4v4 M4 12h3 M11 12h9 M9 10v4 M4 18h11 M19 18h1 M17 16v4",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  building: "M4 21V5l8-2v18 M12 9h8v12 M2 21h20 M7 8h2 M7 12h2 M7 16h2 M15 13h2 M15 17h2",
  history: "M3 12a9 9 0 1 0 3-6.7L3 8 M3 3v5h5 M12 7v5l3 2",
  panel: "M3 4h18v16H3z M9 4v16",
};

export function icon(name: string): TemplateResult {
  return html`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${svg`<path d=${P[name] ?? P.grid}></path>`}</svg>`;
}

/** 왼쪽 메뉴 한 줄: 아이콘 + 이름(접히면 이름은 숨고 마우스를 올리면 보임) */
export function navItem(o: { href: string; label: string; icon: string; on: boolean; badge?: string | number }): TemplateResult {
  return html`<a class="item nav ${o.on ? "on" : ""}" href=${o.href} title=${o.label} aria-current=${o.on ? "page" : "false"}>${icon(o.icon)}<span class="tx">${o.label}</span>${o.badge ? html`<small>${o.badge}</small>` : nothing}</a>`;
}
