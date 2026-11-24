// 주말반 평가 계산(순수 함수, DB 없음). 참고사이트 computeEval 과 같은 규칙 — 문서 47 대조표.
// 회차 n = 같은 주차의 수업들(토·일)을 묶은 한 주. 학생 × 과목마다 항목 점수를 내고 가중 평균한다.

export interface Rules {
  weights: Record<string, number>; hw_scale: Record<string, number>; note_penalty: number; cat_weights: Record<string, number>;
}
export interface Subject { id: number; name: string; category: string; sort: number }
export interface Session { id: number; on_date: string; start_t: string; week_label: string; mock: boolean }
export interface Rec {
  session_id: number; student_id: string; subject_id: number | null;
  att: string | null; book: boolean | null; beh: number | null; nt: number | null; hw: string | null; act: number | null; test: number | null; mock: number | null;
}
export interface Input {
  rules: Rules; subjects: Subject[]; sessions: Session[]; students: { student_id: string; name: string; name_no: number }[];
  records: Rec[]; maxOf: (sessionId: number, subjectId: number) => number | null;
}

export interface Comp { attendance: number; textbook: number; attitude: number; activity: number; homework: number | null; test: number | null; mock: number | null; nt: number; ded: number; total: number; actN: number }
export interface Trend { round: number; math: number; sci: number; comp: number }
export interface Row {
  student_id: string; name: string; name_no: number; comp: Record<number, Comp>; sub: Record<number, number>;
  math: number | null; sci: number | null; final: number | null; weak: number | null; rank: number;
  note: number; ntM: number; ntS: number; ntBy: { m: Record<number, number>; s: Record<number, number> };
  agg: { att: number | null; hw: number | null; test: number | null; act: number };
  trend: Trend[]; raw: Record<number, Record<number, number>>; mockMath: number | null; mockSci: number | null; mockRecent: number | null;
}
export interface Week { no: number; label: string; from: string; to: string; mock: boolean; round: number | null }

export const mean = (a: number[]): number | null => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const MATH = "수학", SCI = "과학";

/** 학기 회차를 주차로 묶는다. 주차 이름이 같으면 한 주, 비어 있으면 날짜마다 한 주. 날짜 순. */
export function weeksOf(sessions: Session[]): { weeks: Week[]; weekOf: Map<number, number> } {
  const byKey = new Map<string, Session[]>();
  for (const s of [...sessions].sort((a, b) => (a.on_date + a.start_t).localeCompare(b.on_date + b.start_t))) {
    const k = s.week_label.trim() || s.on_date;
    byKey.set(k, [...(byKey.get(k) ?? []), s]);
  }
  const weeks: Week[] = [], weekOf = new Map<number, number>();
  let no = 0, round = 0;
  for (const [k, ss] of byKey) {
    no++;
    const mock = ss.some((s) => s.mock);
    weeks.push({ no, label: k, from: ss[0].on_date, to: ss[ss.length - 1].on_date, mock, round: mock ? ++round : null });
    for (const s of ss) weekOf.set(s.id, no);
  }
  return { weeks, weekOf };
}

interface Acc { weeks: Set<number>; attBy: Map<number, number>; bookBy: Set<number>; beh: number; nt: number; ntBy: Map<number, number>; act: number; hw: number[]; test: number[]; mock: Map<number, number>; raw: Map<number, number>; max: Map<number, number> }
const newAcc = (): Acc => ({ weeks: new Set(), attBy: new Map(), bookBy: new Set(), beh: 0, nt: 0, ntBy: new Map(), act: 0, hw: [], test: [], mock: new Map(), raw: new Map(), max: new Map() });

export function evaluate(inp: Input) {
  const { rules, subjects } = inp;
  const { weeks, weekOf } = weeksOf(inp.sessions);
  const sessOrder = new Map(inp.sessions.map((s) => [s.id, s.on_date + s.start_t]));
  const subj = new Map(subjects.map((s) => [s.id, s]));
  const ids = new Set(inp.students.map((s) => s.student_id));
  const acc = new Map<string, Map<number, Acc>>();
  let missingMax = 0;
  // 같은 주·같은 과목 모의가 두 번이면 나중 회차 값(원본도 덮어씀)
  const recs = inp.records.filter((r) => ids.has(r.student_id) && r.subject_id != null && subj.has(r.subject_id) && weekOf.has(r.session_id))
    .sort((a, b) => (sessOrder.get(a.session_id) ?? "").localeCompare(sessOrder.get(b.session_id) ?? ""));
  for (const r of recs) {
    const n = weekOf.get(r.session_id)!, sid = r.subject_id!;
    const vals = [r.att, r.book, r.beh, r.nt, r.hw, r.act, r.test, r.mock];
    if (vals.every((v) => v == null)) continue;
    const bySub = acc.get(r.student_id) ?? new Map<number, Acc>();
    acc.set(r.student_id, bySub);
    const a = bySub.get(sid) ?? newAcc();
    bySub.set(sid, a);
    a.weeks.add(n);
    if (r.att != null) a.attBy.set(n, Math.max(a.attBy.get(n) ?? 0, r.att === "결석" ? 2 : r.att === "지각" ? 1 : 0));
    if (r.book === true) a.bookBy.add(n);
    if (r.beh != null) a.beh += r.beh;
    if (r.nt != null) { a.nt += r.nt; if (r.nt) a.ntBy.set(n, (a.ntBy.get(n) ?? 0) + r.nt); }
    if (r.act != null) a.act += r.act;
    if (r.hw != null && rules.hw_scale[r.hw] != null) a.hw.push(Number(rules.hw_scale[r.hw]));
    if (r.test != null) a.test.push(r.test);
    if (r.mock != null) {
      const mx = inp.maxOf(r.session_id, sid);
      a.raw.set(n, r.mock);
      if (mx) { a.max.set(n, mx); a.mock.set(n, r.mock / mx * 100); } else { a.mock.delete(n); a.max.delete(n); missingMax++; }
    }
  }
  const W = rules.weights, cw = { m: Number(rules.cat_weights[MATH] ?? 60), s: Number(rules.cat_weights[SCI] ?? 40) };
  const ordered = [...subjects].sort((a, b) => a.sort - b.sort || a.id - b.id);
  const rows: Row[] = inp.students.map((s) => {
    const r: Row = { student_id: s.student_id, name: s.name, name_no: s.name_no, comp: {}, sub: {}, math: null, sci: null, final: null, weak: null, rank: 0,
      note: 0, ntM: 0, ntS: 0, ntBy: { m: {}, s: {} }, agg: { att: null, hw: null, test: null, act: 0 }, trend: [], raw: {}, mockMath: null, mockSci: null, mockRecent: null };
    const att: number[] = [], hw: number[] = [], test: number[] = [];
    for (const sb of ordered) {
      const a = acc.get(s.student_id)?.get(sb.id);
      if (!a || !a.weeks.size) continue;
      const abs = [...a.attBy.values()].filter((w) => w === 2).length, late = [...a.attBy.values()].filter((w) => w === 1).length;
      const c = {
        attendance: Math.max(0, 100 - 5 * abs - 2 * late), textbook: Math.max(0, 100 - 5 * a.bookBy.size), attitude: Math.max(0, 100 - 3 * a.beh),
        activity: Math.min(100, 5 * a.act), homework: mean(a.hw), test: mean(a.test), mock: mean([...a.mock.values()]),
      };
      const key: Record<string, string> = { attendance: "att", textbook: "book", attitude: "beh", activity: "act", homework: "hw", test: "test", mock: "mock" };
      let sw = 0, sv = 0;
      for (const [k, v] of Object.entries(c)) if (v != null) { sw += Number(W[key[k]] ?? 0); sv += Number(W[key[k]] ?? 0) * v; }
      const ded = rules.note_penalty * a.nt;
      if (!sw) continue;
      const total = Math.max(0, sv / sw - ded);
      r.comp[sb.id] = { ...c, nt: a.nt, ded, total, actN: a.act };
      r.sub[sb.id] = total;
      const ar = sb.category === MATH ? "m" : sb.category === SCI ? "s" : null;
      if (ar === "m") r.ntM += a.nt; else if (ar === "s") r.ntS += a.nt;
      if (ar) for (const [n, k] of a.ntBy) r.ntBy[ar][n] = (r.ntBy[ar][n] ?? 0) + k;
      att.push(c.attendance); if (c.homework != null) hw.push(c.homework); test.push(...a.test); r.agg.act += a.act;
    }
    r.note = r.ntM + r.ntS;
    r.agg.att = mean(att); r.agg.hw = mean(hw); r.agg.test = mean(test);
    const catMean = (cat: string) => mean(ordered.filter((x) => x.category === cat && r.sub[x.id] != null).map((x) => r.sub[x.id]));
    r.math = catMean(MATH); r.sci = catMean(SCI);
    r.final = r.math != null && r.sci != null ? (r.math * cw.m + r.sci * cw.s) / (cw.m + cw.s) : (r.math ?? r.sci);
    const av = ordered.filter((x) => r.sub[x.id] != null);
    r.weak = av.length ? av.reduce((p, q) => r.sub[p.id] <= r.sub[q.id] ? p : q).id : null;
    // 모의 종합(200점): 같은 회차에 수학·과학이 둘 다 있을 때만
    for (const w of weeks.filter((x) => x.mock)) {
      const raw: Record<number, number> = {};
      let mr = 0, mx = 0, sr = 0, sx = 0;
      for (const sb of ordered) {
        const a = acc.get(s.student_id)?.get(sb.id);
        const v = a?.raw.get(w.no), m = a?.max.get(w.no);
        if (v == null) continue;
        raw[sb.id] = v;
        if (m == null) continue;
        if (sb.category === MATH) { mr += v; mx += m; } else if (sb.category === SCI) { sr += v; sx += m; }
      }
      if (Object.keys(raw).length) r.raw[w.round!] = raw;
      if (mx && sx) {
        const a = mr / mx * 100, b = sr / sx * 100;
        r.trend.push({ round: w.round!, math: a, sci: b, comp: 2 * (a * cw.m + b * cw.s) / (cw.m + cw.s) });
      }
    }
    r.mockMath = mean(r.trend.map((t) => t.math)); r.mockSci = mean(r.trend.map((t) => t.sci));
    r.mockRecent = mean(r.trend.slice(-3).map((t) => t.comp));
    return r;
  });
  const list = rows.filter((r) => r.final != null).sort((a, b) => b.final! - a.final!);
  list.forEach((r, i) => { r.rank = i + 1; });
  const avg = (f: (r: Row) => number | null) => mean(list.map(f).filter((v): v is number => v != null));
  const st = {
    n: list.length, sub: Object.fromEntries(ordered.map((x) => [x.id, avg((r) => r.sub[x.id] ?? null)])) as Record<number, number | null>,
    math: avg((r) => r.math), sci: avg((r) => r.sci), final: avg((r) => r.final), mockMath: avg((r) => r.mockMath), mockSci: avg((r) => r.mockSci),
    mockRecent: avg((r) => r.mockRecent), note: avg((r) => r.note), ntM: avg((r) => r.ntM), ntS: avg((r) => r.ntS),
    test: avg((r) => r.agg.test), hw: avg((r) => r.agg.hw), act: avg((r) => r.agg.act), att: avg((r) => r.agg.att),
    round: {} as Record<number, { comp: number; math: number; sci: number }>,
  };
  for (const w of weeks.filter((x) => x.mock)) {
    const v = list.map((r) => r.trend.find((t) => t.round === w.round)).filter((t): t is Trend => !!t);
    if (v.length) st.round[w.round!] = { comp: mean(v.map((t) => t.comp))!, math: mean(v.map((t) => t.math))!, sci: mean(v.map((t) => t.sci))! };
  }
  return { rows, list, st, weeks, missingMax, subjects: ordered };
}
