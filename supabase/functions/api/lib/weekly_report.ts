// 학생 리포트·모의고사 성적표 계산(순수 함수, DB 없음). 참고사이트 strengths·actionPlan·summaryText·mockStats·mockReportTable·fuSummary 와
// 같은 규칙·같은 문구 — 문서 50 대조표. 원본의 하드코딩(교사 이름·과목 7개·모의 11회)만 W-HUB 자료(과목·시간표 담당)로 바꿨다.
import { type Adm, grpOf } from "./weekly_admit.ts";
import { mean, type Row, type Subject, type Trend } from "./weekly_eval.ts";
import type { Win } from "./weekly_focus.ts";

export interface Stats {
  n: number; sub: Record<number, number | null>; math: number | null; sci: number | null; final: number | null; mockMath: number | null; mockSci: number | null;
  mockRecent: number | null; note: number | null; ntM: number | null; ntS: number | null; test: number | null; hw: number | null; act: number | null; att: number | null;
  round: Record<number, { comp: number; math: number; sci: number }>;
}

export const f1 = (v: number | null | undefined) => v == null || Number.isNaN(v) ? "-" : (+v).toFixed(1);
export const sg = (v: number | null | undefined) => v == null || Number.isNaN(v) ? "" : (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1);

/* ───────── 강점 · 보완할 점 (원본 strengths + GOALS) ───────── */
export interface Sw {
  d: number; t: string; s: string; g?: string; k?: string; sub?: number; cur?: number; avg?: number;
  first?: Trend; last?: Trend; n?: number; nm?: number; ns?: number;
}
const GOALS = {
  sub: (s: string) => `${s} 종합을 반 평균 이상으로 올리는 것`,
  mm: () => "수학 모의고사를 반 평균 이상으로 올리는 것",
  ms: () => "과학 모의고사를 반 평균 이상으로 올리는 것",
  tr: () => "모의고사 하락 흐름을 되돌리는 것",
  ts: () => "위클리테스트 평균을 반 평균 이상으로 올리는 것",
  hw: () => "과제 등급을 B 이상으로 유지하는 것",
  nt: () => "오답노트·이론노트 정리를 빠짐없이 하는 것",
  ac: () => "수업 중 발표를 매주 1회 이상 하는 것",
};

export function strengths(r: Row, st: Stats, subjects: Subject[]): { good: Sw[]; bad: Sw[] } {
  const G: Sw[] = [], B: Sw[] = [];
  const push = (d: number, t: string, s: string, g: string, k: Partial<Sw>) => {
    if (d >= 3) G.push({ d, t, s, ...k });
    if (d <= -3) B.push({ d: -d, t, s, g, ...k });
  };
  for (const sb of subjects) {
    const v = r.sub[sb.id], a = st.sub[sb.id];
    if (v == null || a == null) continue;
    const d = v - a;
    push(d, `${sb.name} 종합 ${f1(v)}점, 반 평균 ${f1(a)}보다 ${sg(d)}`, `${sb.name}(반 평균 ${sg(d)})`, GOALS.sub(sb.name), { k: "sub", sub: sb.id, cur: v, avg: a });
  }
  if (r.mockMath != null && st.mockMath != null) { const d = r.mockMath - st.mockMath; push(d, `모의고사 수학 평균 ${f1(r.mockMath)}점, 반 평균 ${f1(st.mockMath)}보다 ${sg(d)}`, `모의고사 수학(${sg(d)})`, GOALS.mm(), { k: "mm", cur: r.mockMath, avg: st.mockMath }); }
  if (r.mockSci != null && st.mockSci != null) { const d = r.mockSci - st.mockSci; push(d, `모의고사 과학 평균 ${f1(r.mockSci)}점, 반 평균 ${f1(st.mockSci)}보다 ${sg(d)}`, `모의고사 과학(${sg(d)})`, GOALS.ms(), { k: "ms", cur: r.mockSci, avg: st.mockSci }); }
  if (r.trend.length >= 2) {
    const a = r.trend[0], b = r.trend[r.trend.length - 1], d = b.comp - a.comp;
    if (Math.abs(d) >= 6) push(d / 2, `모의고사 종합 ${a.round}회 ${f1(a.comp)} → ${b.round}회 ${f1(b.comp)} (${sg(d)}, 200점)`, d > 0 ? `모의고사 상승 흐름(${sg(d)})` : `모의고사 하락 흐름(${sg(d)})`, GOALS.tr(), { k: "tr", first: a, last: b });
  }
  if (r.agg.test != null && st.test != null) { const d = r.agg.test - st.test; push(d, `위클리테스트 평균 ${f1(r.agg.test)}점, 반 평균 ${f1(st.test)}보다 ${sg(d)}`, `테스트(${sg(d)})`, GOALS.ts(), { k: "ts", cur: r.agg.test, avg: st.test }); }
  if (r.agg.hw != null && st.hw != null) { const d = (r.agg.hw - st.hw) / 3; push(d, `과제 평균 ${f1(r.agg.hw)}점, 반 평균 ${f1(st.hw)}`, "과제 성실도", GOALS.hw(), { k: "hw", cur: r.agg.hw, avg: st.hw }); }
  if (r.note >= 2) B.push({ d: 2 * r.note, t: `노트정리 미흡 ${r.note}회 (오답노트 ${r.ntM} · 이론노트 ${r.ntS}) → 과목 점수 −${2 * r.note}`, s: "노트정리", g: GOALS.nt(), k: "nt", n: r.note, nm: r.ntM, ns: r.ntS });
  else if (r.note === 0 && st.note != null && st.note >= 1.5) G.push({ d: st.note * 2, t: `노트정리 미흡 0회 (반 평균 ${f1(st.note)}회)`, s: "노트정리 성실도" });
  if (st.act != null) {
    const d = r.agg.act - st.act;
    if (Math.abs(d) >= Math.max(3, st.act * 0.2)) push(Math.sign(d) * Math.max(3, Math.abs(d) / 3), `발표 ${r.agg.act}회, 반 평균 ${f1(st.act)}회보다 ${sg(d)}`, "수업 발표", GOALS.ac(), { k: "ac", cur: r.agg.act, avg: st.act });
  }
  G.sort((a, b) => b.d - a.d); B.sort((a, b) => b.d - a.d);
  return { good: G.slice(0, 3), bad: B.slice(0, 3) };
}

/* ───────── 다음 리포트까지 실행 계획 (원본 actionPlan) ───────── */
export interface Plan { t: string; tag: string; a: string; h: string; goal: string }
/** tch: 그 반·과목 담당 선생님 이름(원본은 하드코딩, W-HUB 는 시간표 담당). hope1: 1지망 학교 이름 */
export function actionPlan(r: Row, st: Stats, adm: Adm[], subjects: Subject[], hope1: string, tch: (subjectId: number) => string): Plan[] {
  const sw = strengths(r, st, subjects);
  const tg = (c: number, a: number) => Math.ceil(Math.max(a, c + 3));
  const nameOf = (id?: number) => subjects.find((s) => s.id === id)?.name ?? "";
  const out: Plan[] = [];
  for (const b of sw.bad) {
    let x: Plan | null = null;
    const cur = b.cur as number, avg = b.avg as number;
    if (b.k === "sub" && subjects.find((s) => s.id === b.sub)?.category === "수학") {
      const n = nameOf(b.sub);
      x = { t: `${n} 보강`, tag: "학원 + 가정", a: `위클리테스트와 모의고사의 ${n} 오답을 유형별로 다시 풀고, 풀이를 끝까지 식으로 써서 ${tch(b.sub!)} 선생님께 확인받습니다. 토요일 수업 시간에 ${n} 오답을 먼저 정리합니다.`, h: `주 2회, 30분씩 ${n} 오답노트를 함께 보며 왜 틀렸는지 한 줄로 말해 보게 해 주세요.`, goal: `${n} 종합 ${f1(cur)} → ${tg(cur, avg)}점 이상 (반 평균 ${f1(avg)})` };
    } else if (b.k === "sub") {
      const n = nameOf(b.sub);
      x = { t: `${n} 개념 다지기`, tag: "학원 + 가정", a: `일요일 ${n} 수업 뒤 이론노트에 핵심 개념을 그림과 식으로 정리하고, 위클리테스트 오답에는 개념 근거를 한 줄씩 더 써서 ${tch(b.sub!)} 선생님께 다시 확인받습니다.`, h: `${n} 이론노트를 주 1회 함께 넘겨 보며, 정리한 개념을 말로 설명할 수 있는지 확인해 주세요.`, goal: `${n} 종합 ${f1(cur)} → ${tg(cur, avg)}점 이상 (반 평균 ${f1(avg)})` };
    } else if (b.k === "mm") {
      x = { t: "모의고사 수학", tag: "학원", a: "모의고사 다음 회차 해설 수업에서 틀린 문항을 다시 풀고, 수업 시간에 문항별로 개념 부족, 계산 실수, 시간 부족 중 무엇이 원인인지 표시합니다. 100분 시간 배분도 함께 점검합니다.", h: "모의고사 결과에서 수학 과목별 점수를 같이 보고, 가장 낮은 과목 하나를 2주 목표로 정해 주세요.", goal: `모의고사 수학 ${f1(cur)} → ${tg(cur, avg)}점 이상 (반 평균 ${f1(avg)})` };
    } else if (b.k === "ms") {
      x = { t: "모의고사 과학", tag: "학원", a: "과학 서술 문항은 답만 쓰지 않고 개념 근거를 한 줄 더 쓰는 연습을 합니다. 모의고사 오답은 이론노트의 해당 단원에 옮겨 적어 다시 봅니다.", h: "과학 네 과목 중 점수가 가장 낮은 과목의 이론노트를 주말마다 함께 확인해 주세요.", goal: `모의고사 과학 ${f1(cur)} → ${tg(cur, avg)}점 이상 (반 평균 ${f1(avg)})` };
    } else if (b.k === "tr") {
      x = { t: "모의고사 흐름 회복", tag: "학원 + 가정", a: "최근 모의고사 오답을 유형별로 나누어 하락 원인(개념, 계산, 시간)을 찾고, 담당 선생님과 원인별 보완 과제를 정합니다.", h: "최근 학교 일정이나 컨디션 변화가 있었는지 살펴봐 주시고, 학원과 함께 나눠 주세요.", goal: `다음 모의고사 종합 ${f1(b.last!.comp)} → ${Math.ceil(b.first!.comp)}점 이상 회복 (${b.first!.round}회 수준)` };
    } else if (b.k === "ts") {
      x = { t: "위클리테스트", tag: "학원 + 가정", a: "테스트 전날 그 주 수업 내용을 20분 복습하고, 틀린 문항은 다음 주 오답노트에 반드시 넣어 다시 풉니다.", h: "금요일 저녁 20분 복습 시간을 일정에 고정해 주세요.", goal: `테스트 평균 ${f1(cur)} → ${tg(cur, avg)}점 이상 (반 평균 ${f1(avg)})` };
    } else if (b.k === "hw") {
      x = { t: "과제 성실도", tag: "학원 + 가정", a: "과제는 수업 전날까지 끝내고, 모르는 문항은 표시해서 수업 시간에 질문으로 가져옵니다.", h: "과제 마감 요일을 달력에 표시하고, 전날 밤 완료 여부만 확인해 주세요.", goal: cur >= 60 ? `과제 평균 B 이상 유지 (현재 ${f1(cur)}점 · 반 평균 ${f1(avg)})` : `과제 평균 ${f1(cur)} → ${Math.ceil(Math.max(60, avg))}점 이상 (B 등급 · 반 평균 ${f1(avg)})` };
    } else if (b.k === "nt") {
      x = { t: "오답노트 · 이론노트 정리", tag: "학원 + 가정", a: "수학 오답노트와 과학 이론노트를 매주 완성해 담당 선생님께 확인받습니다. 모의고사 주에는 토요일 수업 시간에 함께 점검합니다.", h: "주말 수업 뒤 노트를 사진으로 함께 확인해 주세요. 빠진 회차가 있으면 다음 주에 보충합니다.", goal: `노트정리 미흡 0회 (이번까지 ${b.n}회 · 과목 점수 −${2 * b.n!})` };
    } else if (b.k === "ac") {
      x = { t: "수업 발표", tag: "학원 + 가정", a: "수업마다 1회 이상 풀이를 발표하는 것을 목표로, 발표할 문항을 미리 정해 옵니다.", h: "집에서 문제 하나를 부모님께 설명해 보는 연습을 주 1회 해 주세요.", goal: `발표 반 평균 수준 (현재 ${cur}회 · 반 평균 ${f1(avg)}회)` };
    }
    if (x) out.push(x);
  }
  const g1 = grpOf(hope1), h1 = g1 != null ? adm[g1] : null;
  if (out.length < 3 && h1 && h1.m != null && h1.m < 0) {
    out.push({ t: `1지망 ${hope1} 안전선`, tag: "학원", a: "모의고사 과목별로 반 평균과 차이가 가장 큰 과목부터 보강하고, 매 회 오답노트 정리로 같은 유형을 두 번 틀리지 않도록 합니다.", h: "모의고사가 끝날 때마다 안전선과의 차이를 함께 확인해 주세요.", goal: `모의고사 종합 ${f1(h1.stu)} → 안전선 ${f1(h1.cut)} 이상 (차이 ${sg(h1.m)})` });
  }
  if (!out.length) {
    const g = sw.good[0];
    out.push({ t: "지금의 흐름 유지", tag: "학원", a: `${g ? g.s.replace(/\(.*\)/, "") + " 등 " : ""}현재 강점을 유지하면서, 모의고사마다 가장 낮았던 과목 하나를 골라 오답노트를 먼저 정리합니다.`, h: "모의고사 결과를 함께 보고 잘한 점을 먼저 짚어 주세요.", goal: h1 && h1.m != null ? `1지망 안전선 대비 ${sg(h1.m)} 이상 유지` : `최종 종합 ${f1(r.final)} 이상 유지` });
  }
  return out.slice(0, 3);
}

/* ───────── 총평 자동 문안 (원본 summaryText) ───────── */
export function summaryText(r: Row, st: Stats, adm: Adm[], k: number, subjects: Subject[], hope1: string): string {
  const a = 3 * k - 2, b = 3 * k;
  const rs = r.trend.filter((t) => t.round >= a && t.round <= b);
  const x = mean(rs.map((t) => t.comp)), y = mean(rs.map((t) => st.round[t.round] && st.round[t.round].comp).filter((v): v is number => v != null));
  const sw = strengths(r, st, subjects);
  const diff = (x as number) - ((y ?? 0) as number); // 원본은 null 을 0 으로 계산
  let s = `${r.name} 학생은 ${k}차 기간(모의고사 ${a}~${b}회) 모의고사 종합 평균 ${f1(x)}점(200점 만점)으로 반 평균 ${f1(y)}점보다 ${Math.abs(diff).toFixed(1)}점 ${(x as number) >= (y ?? 0) ? "높습니다" : "낮습니다"}. `;
  if (sw.good[0]) s += `가장 큰 강점은 ${sw.good[0].s}이고, `;
  if (sw.bad[0]) s += `${sw.bad[0].s} 부분은 보완이 필요합니다. `; else if (sw.good[0]) s += "뚜렷한 약점 없이 고르게 유지되고 있습니다. ";
  const h = hope1 && grpOf(hope1) != null ? adm[grpOf(hope1)!] : null;
  if (h && h.m != null) s += h.m >= 0 ? `1지망(${hope1})은 합격 안전선보다 ${Math.abs(h.m).toFixed(1)}점 높아 '안전' 구간입니다. ` : `1지망(${hope1})은 합격 안전선까지 ${Math.abs(h.m).toFixed(1)}점 남아 '${h.pv}' 구간입니다. `;
  s += `다음 리포트까지 ${sw.bad[0] ? sw.bad[0].g : "지금의 흐름을 유지하는 것"}이 목표입니다.`;
  return s;
}

/* ───────── 모의고사 성적표 (원본 mockStats·pctOf·mockReportTable) ───────── */
/** 그 점수보다 낮은 학생 비율(동점은 절반), 퍼센트 반올림 */
export const pctOf = (vals: number[], v: number): number | null =>
  vals.length ? Math.round((vals.filter((x) => x < v).length + 0.5 * vals.filter((x) => x === v).length) / vals.length * 100) : null;

export interface MockSum { ms?: number; ss?: number; tot?: number; cm?: number; cs?: number; conv?: number; [subjectId: number]: number }
export interface MockStat { avg: number | null; vals: number[] }
export interface MockS {
  max: Record<number, number | null>; mx: number | null; sx: number | null; by: Record<string, Record<number, number> & MockSum>;
  sub: Record<number, MockStat>; ms: MockStat; ss: MockStat; tot: MockStat; conv: MockStat; cm: MockStat; cs: MockStat; cnt: number; rank: (v: number) => number;
}

/** 한 모의 회차: 학생마다 과목 원점수 → 수학·과학 합계(과목이 모두 있을 때만)·환산(수학 100 환산 × 비율 + 과학 100 환산 × 비율 = 200점) */
export function mockStats(p: {
  students: Iterable<string>; subjects: Subject[]; recs: { student_id: string; subject_id: number; value: number }[];
  max: Record<number, number | null>; cw: { m: number; s: number };
}): MockS {
  const order = [...p.students]; // 합산 순서 = 수강생 순서(원본은 입력 순서라 실자료에서 완전히 같을 수는 없고, 같은 순서를 주면 같은 글자가 나온다)
  const ids = new Set(order);
  const math = p.subjects.filter((s) => s.category === "수학"), sci = p.subjects.filter((s) => s.category === "과학");
  const known = new Set(p.subjects.map((s) => s.id));
  const got: MockS["by"] = {};
  for (const x of p.recs) if (ids.has(x.student_id) && known.has(x.subject_id) && Number.isFinite(x.value)) (got[x.student_id] = got[x.student_id] ?? {} as MockS["by"][string])[x.subject_id] = x.value;
  const by: MockS["by"] = {};
  for (const sid of order) if (got[sid]) by[sid] = got[sid];
  const sumMax = (xs: Subject[]) => xs.every((s) => p.max[s.id] != null) ? xs.reduce((a, s) => a + p.max[s.id]!, 0) : null;
  const mx = sumMax(math), sx = sumMax(sci);
  const fm = 2 * p.cw.m / (p.cw.m + p.cw.s), fs = 2 * p.cw.s / (p.cw.m + p.cw.s);
  for (const o of Object.values(by)) {
    if (math.length && math.every((s) => o[s.id] != null)) o.ms = math.reduce((a, s) => a + o[s.id], 0);
    if (sci.length && sci.every((s) => o[s.id] != null)) o.ss = sci.reduce((a, s) => a + o[s.id], 0);
    if (o.ms != null && o.ss != null) {
      o.tot = o.ms + o.ss;
      if (mx && sx) { o.cm = o.ms / mx * 100 * fm; o.cs = o.ss / sx * 100 * fs; o.conv = o.cm + o.cs; }
    }
  }
  const col = (k: string | number) => Object.values(by).map((o) => (o as Record<string | number, number>)[k]).filter((v) => v != null);
  const stat = (k: string | number): MockStat => { const v = col(k); return { avg: mean(v), vals: v }; };
  const S = { max: p.max, mx, sx, by, sub: {} as Record<number, MockStat>, ms: stat("ms"), ss: stat("ss"), tot: stat("tot"), conv: stat("conv"), cm: stat("cm"), cs: stat("cs"), cnt: 0, rank: (_v: number) => 0 };
  for (const s of p.subjects) S.sub[s.id] = stat(s.id);
  const rk = [...col("conv")].sort((a, b) => b - a);
  S.rank = (v: number) => rk.indexOf(v) + 1; S.cnt = rk.length;
  return S;
}

export interface MockCell { v: number | null; max: number | null; avg: number | null; pct: number | null }
export interface MockTable { round: number; date: string; rows: { label: string; sum: boolean; c: MockCell }[]; conv: MockCell }
/** 리포트용 학생 한 명의 모의고사 성적표(원본 mockReportTable): 원점수가 있는 회차만 */
export function mockTable(r: Row, a: number, b: number, subjects: Subject[], byRound: (m: number) => MockS, dateOf: (m: number) => string): MockTable[] {
  const out: MockTable[] = [];
  for (let m = a; m <= b; m++) {
    if (!r.raw || !r.raw[m]) continue;
    const S = byRound(m), o = S.by[r.student_id] ?? {} as MockS["by"][string];
    const cell = (v: number | undefined, mx: number | null, st: MockStat): MockCell => v == null ? { v: null, max: mx, avg: null, pct: null } : { v, max: mx, avg: st.avg, pct: pctOf(st.vals, v) };
    const math = subjects.filter((s) => s.category === "수학"), sci = subjects.filter((s) => s.category === "과학");
    const rows: MockTable["rows"] = [
      ...math.map((s) => ({ label: s.name, sum: false, c: cell(o[s.id], S.max[s.id] ?? null, S.sub[s.id]) })),
      { label: "수학 합계", sum: true, c: cell(o.ms, S.mx, S.ms) },
      ...sci.map((s) => ({ label: s.name, sum: false, c: cell(o[s.id], S.max[s.id] ?? null, S.sub[s.id]) })),
      { label: "과학 합계", sum: true, c: cell(o.ss, S.sx, S.ss) },
      { label: "총점", sum: true, c: cell(o.tot, S.mx != null && S.sx != null ? S.mx + S.sx : null, S.tot) },
    ];
    out.push({ round: m, date: dateOf(m), rows, conv: o.conv != null ? { v: o.conv, max: 200, avg: S.conv.avg, pct: pctOf(S.conv.vals, o.conv) } : { v: null, max: 200, avg: null, pct: null } });
  }
  return out;
}

/* ───────── 사후관리 한 줄 (원본 fuSummary) ───────── */
export const FOLLOW_KINDS = ["보충수업", "학생 상담", "학부모 상담", "과제 재제출", "기타"];
/** k차 리포트: 지난 리포트(k−1차) 뒤 기간의 그 학생 조치 기록 종류별 횟수. 1차이거나 기록이 없으면 null. */
export function fuSummary(studentId: string, k: number, wins: Win[], follows: { student_id: string; on_date: string; kind: string }[]): string | null {
  if (k < 2) return null;
  const w = wins.find((x) => x.k === k - 1);
  if (!w) return null;
  const L = follows.filter((f) => f.student_id === studentId && f.on_date >= w.from && f.on_date < w.to);
  if (!L.length) return null;
  const c: Record<string, number> = {};
  for (const f of L) c[f.kind] = (c[f.kind] ?? 0) + 1;
  return `지난 리포트 이후(${w.label}) 학원에서 ${FOLLOW_KINDS.filter((t) => c[t]).map((t) => `${t} ${c[t]}회`).join(", ")}를 진행했습니다.`;
}

/** 과제 평균 → 등급 글자(원본 hwL) */
export const hwLetter = (v: number | null) => v == null ? "-" : v >= 80 ? "A" : v >= 50 ? "B" : v >= 20 ? "C" : "D";

/** 차트 아래 설명 문장(원본 chartNote) */
export function chartNote(r: Row, st: Stats, k: number, h1: Adm | null, hope1: string): string {
  const a = 3 * k - 2, b = 3 * k;
  const rs = r.trend.filter((t) => t.round >= a && t.round <= b);
  const pm = mean(rs.map((t) => t.comp)), cAvg = mean(rs.map((t) => st.round[t.round] && st.round[t.round].comp).filter((v): v is number => v != null));
  const d = (pm as number) - ((cAvg ?? 0) as number);
  return `${a}~${b}회 모의고사 환산 총점은 ${rs.map((t) => f1(t.comp)).join(" → ")}점이고, 기간 평균 ${f1(pm)}점은 반 평균 ${f1(cAvg)}점보다 ${Math.abs(d).toFixed(1)}점 ${(pm as number) >= (cAvg ?? 0) ? "높습니다" : "낮습니다"}.${h1 && h1.m != null ? ` 1지망 ${hope1}의 합격 안전선(합격률 80% 이상)과의 차이는 ${sg(h1.m)}점입니다.` : ""}`;
}
