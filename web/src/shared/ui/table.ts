// 공용 목록 표: 열 정의만 주면 정렬·행 클릭이 된다. (점수 입력표는 grid.ts — 성적 단계에서)
import { html, type TemplateResult } from "lit-html";

export interface Col<T> {
  key: string;
  label: string;
  value: (r: T) => string | number | null;
  cell?: (r: T) => TemplateResult | string;
  num?: boolean;
}
export interface TableState { sort: string; desc: boolean }

export function table<T>(rows: T[], cols: Col<T>[], st: TableState, opt: { onRow?: (r: T) => void; redraw: () => void; empty?: string }): TemplateResult {
  const col = cols.find((c) => c.key === st.sort);
  const sorted = col
    ? [...rows].sort((a, b) => {
      const x = col.value(a), y = col.value(b);
      const r = x == null ? 1 : y == null ? -1 : typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "ko");
      return st.desc ? -r : r;
    })
    : rows;
  const click = (k: string) => { st.desc = st.sort === k ? !st.desc : false; st.sort = k; opt.redraw(); };
  return html`<table class="t">
    <thead><tr>${cols.map((c) => html`<th @click=${() => click(c.key)} style=${c.num ? "text-align:right" : ""}>${c.label}${st.sort === c.key ? html` <span class="sort-ar">${st.desc ? "▼" : "▲"}</span>` : ""}</th>`)}</tr></thead>
    <tbody>${sorted.length ? sorted.map((r) => html`<tr class=${opt.onRow ? "click" : ""} @click=${() => opt.onRow?.(r)}>
        ${cols.map((c) => html`<td class=${c.num ? "num" : ""} style=${c.num ? "text-align:right" : ""}>${c.cell ? c.cell(r) : c.value(r) ?? ""}</td>`)}</tr>`)
      : html`<tr><td colspan=${cols.length} class="empty">${opt.empty ?? "자료가 없습니다."}</td></tr>`}</tbody>
  </table>`;
}
