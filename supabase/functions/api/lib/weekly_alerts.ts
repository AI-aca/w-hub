// 과목 경보(순수 함수). 참고사이트 computeAlerts 와 같은 규칙 — 문서 47 대조표 4절.
// 줄(series) = 학생 × 과목. 주차마다 그 줄의 값을 모아 차례로 본다. 경보의 담당 강사 = 그 주 그 칸의 강사.
// 원본은 한 반 한 과목을 강사 2명이 나눠 맡으면 줄을 따로 봤다. W-HUB 는 대체 강사·강사 빈 칸이 있어도 연속을 놓치지 않도록 합친다(문서 47).
import { mean, weeksOf, type Session } from "./weekly_eval.ts";

export interface AlertCfg { drop: number; gap: number; rep: number; days: number }
export interface ACell { session_id: number; class_id: number; subject_id: number | null; staff_id: string | null }
export interface ARec { session_id: number; class_id: number; student_id: string; att: string | null; hw: string | null; nt: number | null; test: number | null; mock: number | null; book?: boolean | null; beh?: number | null; act?: number | null }
export interface AFollow { student_id: string; subject_id: number | null; on_date: string; alert_key: string | null }
export interface AInput {
  cfg: AlertCfg; subjects: { id: number; name: string; category: string }[]; sessions: Session[]; cells: ACell[];
  students: { student_id: string; name: string; class_id: number | null }[]; records: ARec[];
  maxOf: (sessionId: number, subjectId: number) => number | null; follows: AFollow[]; today: string;
}
export interface Reason { t: "mock" | "test" | "hw" | "nt" | "att"; x: string }
export interface Alert {
  id: string; student_id: string; name: string; class_id: number; subject_id: number; staff_id: string | null; week: number; week_label: string;
  date: string; due: string; rs: Reason[]; st: "wait" | "over" | "done" | "late"; days: number | null; left: number | null; logs: AFollow[];
}

const sg = (v: number) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1);
const addD = (s: string, k: number) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + k)).toISOString().slice(0, 10); };
const dDiff = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);
const BADHW = (v: string) => v === "C" || v === "D", BADATT = (v: string) => v === "결석" || v === "지각";

interface Entry { att?: string; hw?: string; nt?: number; test?: number; mockN?: number; date: string; staff: string | null }

export function computeAlerts(inp: AInput): Alert[] {
  const { cfg } = inp, R = cfg.rep;
  const { weeks, weekOf } = weeksOf(inp.sessions);
  const sess = new Map(inp.sessions.map((s) => [s.id, s]));
  const cell = new Map(inp.cells.map((c) => [`${c.session_id}:${c.class_id}`, c]));
  const stu = new Map(inp.students.filter((s) => s.class_id != null).map((s) => [s.student_id, s]));
  const subj = new Map(inp.subjects.map((s) => [s.id, s]));
  const ser = new Map<string, Map<number, Entry>>(), mk = new Map<string, number[]>();
  const recs = inp.records.filter((r) => stu.has(r.student_id) && weekOf.has(r.session_id))
    .sort((a, b) => { const x = sess.get(a.session_id)!, y = sess.get(b.session_id)!; return (x.on_date + x.start_t).localeCompare(y.on_date + y.start_t); });
  for (const r of recs) {
    const c = cell.get(`${r.session_id}:${r.class_id}`);
    if (!c || c.subject_id == null || !subj.has(c.subject_id)) continue;
    if ([r.att, r.hw, r.nt, r.test, r.mock, r.book ? true : null, r.beh, r.act].every((v) => v == null)) continue; // 교재는 미지참(true)만 값
    const n = weekOf.get(r.session_id)!, s = stu.get(r.student_id)!;
    const key = `${r.student_id}|${c.subject_id}`;
    const o = ser.get(key) ?? new Map<number, Entry>();
    ser.set(key, o);
    const e = o.get(n) ?? { date: "", staff: null };
    o.set(n, e);
    e.date = sess.get(r.session_id)!.on_date;
    e.staff = c.staff_id ?? e.staff;
    if (r.att != null) e.att = r.att;
    if (r.hw != null) e.hw = r.hw;
    if (r.nt != null) e.nt = r.nt;
    if (r.test != null) e.test = r.test;
    if (r.mock != null) {
      const mx = inp.maxOf(r.session_id, c.subject_id);
      if (mx) {
        e.mockN = r.mock / mx * 100;
        const ck = `${s.class_id}|${c.subject_id}|${n}`;
        mk.set(ck, [...(mk.get(ck) ?? []), e.mockN]);
      }
    }
  }
  const out: Alert[] = [];
  for (const [key, o] of ser) {
    const [sid, subStr] = key.split("|");
    const subId = Number(subStr), s = stu.get(sid)!, sb = subj.get(subId)!;
    const mocks: { pos: number | null; gap: boolean }[] = [], tests: number[] = [], hws: string[] = [], nts: number[] = [], atts: string[] = [];
    for (const n of [...o.keys()].sort((a, b) => a - b)) {
      const e = o.get(n)!, rs: Reason[] = [];
      if (e.mockN != null) {
        const prev = mocks[mocks.length - 1], av = mean(mk.get(`${s.class_id}|${subId}|${n}`) ?? []);
        const pos = av == null ? null : e.mockN - av;
        if (prev && prev.pos != null && pos != null && prev.pos - pos >= cfg.drop) rs.push({ t: "mock", x: `모의 반 평균 대비 ${sg(prev.pos)} → ${sg(pos)} (${(prev.pos - pos).toFixed(1)}점 하락)` });
        const gp = pos != null && -pos >= cfg.gap;
        if (gp && !(prev && prev.gap) && !rs.length) rs.push({ t: "mock", x: `모의 반 평균보다 −${(-pos!).toFixed(1)}` });
        mocks.push({ pos, gap: gp });
      }
      if (e.test != null) {
        tests.push(e.test);
        const t = tests.slice(-(R + 1));
        if (t.length === R + 1 && t.every((v, i) => i === 0 || v < t[i - 1]) && t[0] - t[R] >= cfg.drop && !(tests.length > R + 1 && tests[tests.length - R - 2] > t[0]))
          rs.push({ t: "test", x: `테스트 ${R}회 연속 하락 (${t.join(" → ")})` });
      }
      if (e.hw != null) {
        hws.push(e.hw);
        const t = hws.slice(-R);
        if (t.length === R && t.every(BADHW) && !(hws.length > R && BADHW(hws[hws.length - R - 1]))) rs.push({ t: "hw", x: `과제 ${t.join("·")} ${R}회 연속` });
      }
      nts.push(e.nt ?? 0);
      {
        const t = nts.slice(-R);
        if (t.length === R && t.every((v) => v > 0) && !(nts.length > R && nts[nts.length - R - 1] > 0)) rs.push({ t: "nt", x: `${sb.category === "수학" ? "오답" : "이론"}노트 미흡 ${R}회 연속` });
      }
      atts.push(e.att ?? "");
      if (BADATT(e.att ?? "")) {
        const k = atts.slice(-3).filter(BADATT).length, k0 = atts.slice(-4, -1).filter(BADATT).length;
        if (k >= R && k0 < R) rs.push({ t: "att", x: `결석·지각 최근 3회 중 ${k}회` });
      }
      if (rs.length) {
        const w = weeks[n - 1];
        out.push({ id: `${sid}_${subId}_${n}`, student_id: sid, name: s.name, class_id: s.class_id!, subject_id: subId, staff_id: e.staff,
          week: n, week_label: w.label, date: e.date, due: addD(e.date, cfg.days), rs, st: "wait", days: null, left: null, logs: [] });
      }
    }
  }
  for (const a of out) {
    const L = inp.follows.filter((f) => f.student_id === a.student_id && f.subject_id === a.subject_id && (f.alert_key === a.id || f.on_date >= a.date))
      .sort((x, y) => x.on_date.localeCompare(y.on_date));
    a.logs = L;
    if (L.length) { a.days = Math.max(0, dDiff(L[0].on_date, a.date)); a.st = L[0].on_date <= a.due ? "done" : "late"; }
    else { a.st = inp.today > a.due ? "over" : "wait"; a.left = dDiff(a.due, inp.today); }
  }
  const nm = (x: Alert) => x.name;
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.class_id - b.class_id || nm(a).localeCompare(nm(b), "ko"));
}

export const isOpen = (a: Alert) => a.st === "wait" || a.st === "over";
