// 평가 대시보드 그래프(SVG). 학생 = 파랑, 반 평균 = 청록(검사한 색 쌍). 범례·끝값 표시, 마우스를 올리면 값.
import { html, svg, type TemplateResult } from "lit-html";
import { type EvRow, type EvStats, type EvSubject, f1 } from "./evaltext";

const STU = "#2a78d6", AVG = "#1baf7a", GRID = "#e9ebef", INK2 = "#4b5563", MUTE = "#8a919c", SURF = "#ffffff";

const legend = () => html`<div class="lg"><span><i style="background:${STU}"></i>학생</span><span><i style="background:${AVG}"></i>반 평균</span></div>`;

/** 안전선(커트라인) = 주황 점선. 학생 1지망 그룹의 회차별 값 */
const CUTC = "#c4721f";
const legend3 = (cut: boolean) => html`<div class="lg"><span><i style="background:${STU}"></i>학생</span><span><i style="background:${AVG}"></i>반 평균</span>${cut ? html`<span><i style="background:${CUTC}"></i>1지망 안전선</span>` : ""}</div>`;

export interface TrendOpts { cut?: { round: number; value: number }[]; from?: number; to?: number }
interface Pt { m: number; v: number }

/** 모의고사 종합(200점) 추이: 학생·반 평균·(있으면) 1지망 안전선. to = 이 회차까지만, from = 이 회차부터 이번 기간으로 칠함 */
export function trendChart(r: EvRow, st: EvStats, o: TrendOpts = {}): TemplateResult {
  const rounds = [...new Set([...Object.keys(st.round).map(Number), ...r.trend.map((t) => t.round)])].filter((m) => o.to == null || m <= o.to).sort((a, b) => a - b);
  return drawTrend(r.name, rounds, r.trend.filter((t) => rounds.includes(t.round)).map((t) => ({ m: t.round, v: t.comp })),
    rounds.filter((m) => st.round[m]).map((m) => ({ m, v: st.round[m].comp })), (o.cut ?? []).filter((c) => rounds.includes(c.round)).map((c) => ({ m: c.round, v: c.value })), o.from);
}
/** 서버가 이미 골라 준 계열로 그리기(리포트) */
export function trendFromSeries(name: string, c: { rounds: number[]; from: number; me: { round: number; comp: number }[]; avg: { round: number; comp: number }[]; cut: { round: number; value: number }[] }): TemplateResult {
  return drawTrend(name, c.rounds, c.me.map((t) => ({ m: t.round, v: t.comp })), c.avg.map((t) => ({ m: t.round, v: t.comp })), c.cut.map((t) => ({ m: t.round, v: t.value })), c.from);
}

function drawTrend(name: string, rounds: number[], me: Pt[], av: Pt[], cut: Pt[], hiFrom?: number): TemplateResult {
  if (!rounds.length) return html`<div class="empty">모의고사 기록이 없습니다. 같은 회차에 수학·과학 원점수와 만점이 있어야 종합이 나옵니다.</div>`;
  const W = 560, H = 240, pl = 40, pr = 84, pt = 18, pb = 30;
  const vals = [...me.map((t) => t.v), ...av.map((t) => t.v), ...cut.map((t) => t.v)];
  const lo = Math.max(0, Math.floor((Math.min(...vals) - 10) / 20) * 20), hi = Math.min(200, Math.ceil((Math.max(...vals) + 10) / 20) * 20);
  const y = (v: number) => pt + (H - pt - pb) * (1 - (v - lo) / Math.max(1, hi - lo));
  const x = (m: number) => pl + (W - pl - pr) * (rounds.length > 1 ? rounds.indexOf(m) / (rounds.length - 1) : 0.5);
  const ticks: number[] = []; for (let v = lo; v <= hi; v += 20) ticks.push(v);
  const line = (pts: Pt[], c: string, dash = "") => pts.length ? svg`<polyline fill="none" stroke=${c} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray=${dash} points=${pts.map((p) => `${x(p.m)},${y(p.v)}`).join(" ")}></polyline>` : svg``;
  const dots = (pts: Pt[], c: string, who: string) => pts.map((p) => svg`<circle cx=${x(p.m)} cy=${y(p.v)} r="4.5" fill=${c} stroke=${SURF} stroke-width="2"><title>${who} ${p.m}회 ${f1(p.v)}점</title></circle>`);
  const end = (pts: Pt[], label: string, dy: number) => pts.length ? svg`<text x=${x(pts[pts.length - 1].m) + 9} y=${y(pts[pts.length - 1].v) + dy} font-size="11" fill=${INK2} font-weight="700">${label} ${f1(pts[pts.length - 1].v)}</text>` : svg``;
  const meLast = me.at(-1)?.v ?? 0, avLast = av.at(-1)?.v ?? 0;
  const band = hiFrom != null && hiFrom > rounds[0] ? svg`<rect x=${x(hiFrom) - 16} y=${pt - 10} width=${x(rounds[rounds.length - 1]) - x(hiFrom) + 32} height=${H - pt - pb + 10} rx="8" fill="#e8f1fb"></rect>` : svg``;
  return html`${legend3(cut.length > 0)}<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="모의고사 종합 추이(200점)">
    ${band}
    ${ticks.map((v) => svg`<line x1=${pl} x2=${W - pr + 10} y1=${y(v)} y2=${y(v)} stroke=${GRID} stroke-width="1"></line><text x=${pl - 6} y=${y(v) + 4} text-anchor="end" font-size="10" fill=${MUTE}>${v}</text>`)}
    ${rounds.map((m) => svg`<text x=${x(m)} y=${H - 10} text-anchor="middle" font-size="11" fill=${MUTE}>${m}회</text>`)}
    ${line(cut, CUTC, "2 4")}${cut.length ? svg`<text x=${x(cut[cut.length - 1].m) + 9} y=${y(cut[cut.length - 1].v) + 4} font-size="10.5" fill=${CUTC}>안전선 ${f1(cut[cut.length - 1].v)}</text>` : svg``}
    ${line(av, AVG)}${line(me, STU)}${dots(av, AVG, "반 평균")}${dots(me, STU, name)}
    ${end(me, "학생", meLast >= avLast ? -6 : 14)}${end(av, "평균", meLast >= avLast ? 14 : -6)}
  </svg>`;
}

/** 과목별 종합(막대) + 반 평균(가로 눈금) */
export function subjectBars(r: EvRow, st: EvStats, subjects: EvSubject[]): TemplateResult {
  return barsChart(subjects.filter((s) => r.sub[s.id] != null).map((s) => ({ name: s.name, v: r.sub[s.id], avg: st.sub[s.id] ?? null })));
}
/** 서버가 골라 준 과목별 값으로 그리기(리포트·대시보드 공용) */
export function barsChart(items: { name: string; v: number; avg: number | null }[]): TemplateResult {
  const subs = items;
  if (!subs.length) return html`<div class="empty">과목 기록이 없습니다.</div>`;
  const W = 560, H = 220, pl = 32, pb = 26, pt = 18, band = (W - pl - 8) / subs.length, bw = Math.min(24, band * 0.5);
  const y = (v: number) => pt + (H - pt - pb) * (1 - v / 100);
  return html`${legend()}<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="과목별 종합 점수">
    ${[0, 50, 100].map((v) => svg`<line x1=${pl} x2=${W - 6} y1=${y(v)} y2=${y(v)} stroke=${GRID} stroke-width="1"></line><text x=${pl - 6} y=${y(v) + 4} text-anchor="end" font-size="10" fill=${MUTE}>${v}</text>`)}
    ${subs.map((s, i) => {
      const cx = pl + band * i + band / 2, v = s.v, a = s.avg;
      const top = y(v), h = Math.max(0, y(0) - top), rr = Math.min(4, h);
      return svg`<path d=${`M${cx - bw / 2},${y(0)} V${top + rr} Q${cx - bw / 2},${top} ${cx - bw / 2 + rr},${top} H${cx + bw / 2 - rr} Q${cx + bw / 2},${top} ${cx + bw / 2},${top + rr} V${y(0)} Z`}
          fill=${STU}><title>${s.name} ${f1(v)}점 · 반 평균 ${f1(a)}</title></path>
        ${a != null ? svg`<line x1=${cx - bw / 2 - 6} x2=${cx + bw / 2 + 6} y1=${y(a)} y2=${y(a)} stroke=${AVG} stroke-width="2" stroke-linecap="round"><title>${s.name} 반 평균 ${f1(a)}</title></line>` : svg``}
        <text x=${cx} y=${Math.min(top, a != null ? y(a) : top) - 6} text-anchor="middle" font-size="11" font-weight="700" fill=${INK2}>${v.toFixed(0)}</text>
        <text x=${cx} y=${H - 8} text-anchor="middle" font-size="11" fill=${INK2}>${s.name}</text>`;
    })}
  </svg>`;
}
