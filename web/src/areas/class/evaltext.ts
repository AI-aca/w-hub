// 평가 결과 자료 모양과 '강점·보완할 점' 문구(참고사이트 strengths 와 같은 기준: 반 평균과 ±3점).
export interface Comp { attendance: number; textbook: number; attitude: number; activity: number; homework: number | null; test: number | null; mock: number | null; nt: number; ded: number; total: number; actN: number }
export interface Trend { round: number; math: number; sci: number; comp: number }
export interface EvRow {
  student_id: string; name: string; name_no: number; comp: Record<string, Comp>; sub: Record<string, number>;
  math: number | null; sci: number | null; final: number | null; weak: number | null; rank: number;
  note: number; ntM: number; ntS: number; ntBy: { m: Record<string, number>; s: Record<string, number> };
  agg: { att: number | null; hw: number | null; test: number | null; act: number };
  trend: Trend[]; mockMath: number | null; mockSci: number | null; mockRecent: number | null;
}
export interface EvStats {
  n: number; sub: Record<string, number | null>; math: number | null; sci: number | null; final: number | null; mockMath: number | null; mockSci: number | null;
  mockRecent: number | null; note: number | null; ntM: number | null; ntS: number | null; test: number | null; hw: number | null; act: number | null; att: number | null;
  round: Record<string, { comp: number; math: number; sci: number }>;
}
export interface EvWeek { no: number; label: string; from: string; to: string; mock: boolean; round: number | null }
export interface EvSubject { id: number; name: string; category: string; sort: number }
export interface EvResp { rows: EvRow[]; st: EvStats; weeks: EvWeek[]; missingMax: number; subjects: EvSubject[]; cat_weights: Record<string, number>; weights: Record<string, number> }

export const f1 = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? "-" : v.toFixed(1));
export const sg = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? "" : (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1));

interface Item { d: number; t: string; s: string }
/** 강점·보완할 점 각 3개까지(원본 strengths 와 같은 항목·기준·문구) */
export function strengths(r: EvRow, st: EvStats, subjects: EvSubject[]): { good: Item[]; bad: Item[] } {
  const G: Item[] = [], B: Item[] = [];
  const push = (d: number, t: string, s: string) => { if (d >= 3) G.push({ d, t, s }); if (d <= -3) B.push({ d: -d, t, s }); };
  for (const sb of subjects) {
    const v = r.sub[sb.id], a = st.sub[sb.id];
    if (v == null || a == null) continue;
    const d = v - a;
    push(d, `${sb.name} 종합 ${f1(v)}점, 반 평균 ${f1(a)}보다 ${sg(d)}`, `${sb.name}(반 평균 ${sg(d)})`);
  }
  if (r.mockMath != null && st.mockMath != null) { const d = r.mockMath - st.mockMath; push(d, `모의고사 수학 평균 ${f1(r.mockMath)}점, 반 평균 ${f1(st.mockMath)}보다 ${sg(d)}`, `모의고사 수학(${sg(d)})`); }
  if (r.mockSci != null && st.mockSci != null) { const d = r.mockSci - st.mockSci; push(d, `모의고사 과학 평균 ${f1(r.mockSci)}점, 반 평균 ${f1(st.mockSci)}보다 ${sg(d)}`, `모의고사 과학(${sg(d)})`); }
  if (r.trend.length >= 2) {
    const a = r.trend[0], b = r.trend[r.trend.length - 1], d = b.comp - a.comp;
    if (Math.abs(d) >= 6) push(d / 2, `모의고사 종합 ${a.round}회 ${f1(a.comp)} → ${b.round}회 ${f1(b.comp)} (${sg(d)}, 200점)`, d > 0 ? `모의고사 상승 흐름(${sg(d)})` : `모의고사 하락 흐름(${sg(d)})`);
  }
  if (r.agg.test != null && st.test != null) { const d = r.agg.test - st.test; push(d, `위클리테스트 평균 ${f1(r.agg.test)}점, 반 평균 ${f1(st.test)}보다 ${sg(d)}`, `테스트(${sg(d)})`); }
  if (r.agg.hw != null && st.hw != null) { const d = (r.agg.hw - st.hw) / 3; push(d, `과제 평균 ${f1(r.agg.hw)}점, 반 평균 ${f1(st.hw)}`, "과제 성실도"); }
  if (r.note >= 2) B.push({ d: 2 * r.note, t: `노트정리 미흡 ${r.note}회 (오답노트 ${r.ntM} · 이론노트 ${r.ntS})`, s: "노트정리" });
  else if (r.note === 0 && st.note != null && st.note >= 1.5) G.push({ d: st.note * 2, t: `노트정리 미흡 0회 (반 평균 ${f1(st.note)}회)`, s: "노트정리 성실도" });
  if (st.act != null) {
    const d = r.agg.act - st.act;
    if (Math.abs(d) >= Math.max(3, st.act * 0.2)) push(Math.sign(d) * Math.max(3, Math.abs(d) / 3), `발표 ${r.agg.act}회, 반 평균 ${f1(st.act)}회보다 ${sg(d)}`, "수업 발표");
  }
  G.sort((a, b) => b.d - a.d); B.sort((a, b) => b.d - a.d);
  return { good: G.slice(0, 3), bad: B.slice(0, 3) };
}
