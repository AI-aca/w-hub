// 3-2 C 원본 대조(문서 50): 참고사이트 원본(HTML) 안의 계산 함수를 그대로 떼어, 무작위 자료로 W-HUB 계산(서버 lib)과 비교한다.
// 사용: node tools/compare/weekly_c.mjs <참고사이트_주말특강_index.html 경로> [묶음 수(기본 6)]
// 원본 파일은 저장소에 없다(참고사이트는 GitHub 에 없고 개인정보가 섞일 수 있어 PC 사본으로만 읽음). 이 스크립트는 원본 코드를 담지 않고 실행할 때 읽는다.
// 자료는 전부 무작위로 만든 가짜(실제 학생 없음). Node 22.18 이상(.ts 를 바로 불러옴).
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";

const ROOT = new URL("../../supabase/functions/api/lib/", import.meta.url).href;
const HTML = process.argv[2];
if (!HTML) { console.error("사용: node tools/compare/weekly_c.mjs <참고사이트_주말특강_index.html 경로> [묶음 수]"); process.exit(2); }
const raw = fs.readFileSync(HTML);
console.log("원본 sha256", crypto.createHash("sha256").update(raw).digest("hex"), "줄 수", raw.toString("utf8").split("\n").length);
const lines = raw.toString("utf8").split("\n");
const L = (a, b) => lines.slice(a - 1, b).join("\n");

const E = await import(ROOT + "weekly_eval.ts");
const A = await import(ROOT + "weekly_admit.ts");
const R = await import(ROOT + "weekly_report.ts");
const F = await import(ROOT + "weekly_focus.ts");

// ── 원본 코드 조각(줄 번호는 문서 50 에 기록) ──
const code = [L(651, 724), L(930, 1035), L(1208, 1214), L(1266, 1274), L(1302, 1306)].join("\n");
const ctx = vm.createContext({ console, Math, Date, Object, Array, Set, Map, Number, String, JSON, RegExp, isNaN });
ctx.REC = {}; ctx.shown = () => []; // 원본에서 화면 쪽이 채우던 전역
vm.runInContext(code, ctx);
const O = (expr) => vm.runInContext(expr, ctx);

// ── 무작위 ──
let seed = 1;
const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (a) => a[ri(0, a.length - 1)];
const r1 = (v) => Math.round(v * 10) / 10;

const SUBJ7 = O("SUBJ7"), MATH3 = O("MATH3"), SK = O("SK"), SATS = O("SATS"), Y = O("Y");
const subjects = SUBJ7.map((n, i) => ({ id: i + 1, name: n, category: MATH3.includes(n) ? "수학" : "과학", sort: i + 1 }));
const idOf = Object.fromEntries(subjects.map((s) => [s.name, s.id]));
const nameOf = Object.fromEntries(subjects.map((s) => [s.id, s.name]));
const MDEF = O("MDEF");
const SCHOOL_NAMES = O("SCHOOLS").map((s) => s[0]);
const pad = (n) => String(n).padStart(2, "0");
const ymd = (m, d) => `${Y}-${pad(m)}-${pad(d)}`;
const nextDay = (m, d) => { const t = new Date(Date.UTC(Y, m - 1, d + 1)); return [t.getUTCMonth() + 1, t.getUTCDate()]; };

let fails = 0, checks = 0;
const eq = (a, b, what, tol = 0) => { // 표시 글자까지 같아야 하므로 숫자도 한 비트도 다르면 안 된다
  checks++;
  const ok = (a == null && b == null) || (typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b))) || a === b;
  if (!ok) { fails++; if (fails < 25) console.log("차이:", what, "원본=", a, "W-HUB=", b); }
};

// 글 비교: 한 글자도 다르면 안 된다.
const eqText = (a, b, what) => {
  checks++;
  if (a === b) return;
  fails++; if (fails < 25) console.log("차이:", what, "| 원본=", a, "| W-HUB=", b);
};
const BUNDLES = Number(process.argv[3] ?? 6);
for (let bundle = 0; bundle < BUNDLES; bundle++) {
  seed = 1000 + bundle * 7919;
  // 주차(원본 n 1~18, 모의 11회 = n 20) → W-HUB 세션 2개(토·일, 20 은 1개)
  const weeksN = [...SATS.map((_, i) => i + 1), 20];
  const mockBySess = O("mockBySess"), sessByMock = O("sessByMock");
  const sessions = []; const sessOfWeek = {}; let sid = 0;
  for (const n of weeksN) {
    const [m, d] = n === 20 ? [6, 19] : SATS[n - 1];
    const isMock = n === 20 || !!mockBySess[n];
    const list = [];
    list.push({ id: ++sid, on_date: ymd(m, d), start_t: "10:00", week_label: `${n}회`, mock: isMock });
    if (n !== 20) { const [m2, d2] = nextDay(m, d); list.push({ id: ++sid, on_date: ymd(m2, d2), start_t: "10:00", week_label: `${n}회`, mock: isMock }); }
    sessOfWeek[n] = list; sessions.push(...list);
  }
  const weekNo = (n) => n === 20 ? weeksN.length : n; // W-HUB 주차 번호(1부터)
  const roundOfN = (n) => n === 20 ? 11 : mockBySess[n];
  // 모의 만점: 회차×과목 일부만(없으면 기본값 = MDEF)
  const MC = {};
  for (let m = 1; m <= 11; m++) if (rnd() < 0.7) { MC[m] = {}; for (const s of SUBJ7) if (rnd() < 0.7) MC[m][SK[s]] = pick([20, 25, 30, 35, 40, 45]); }
  vm.runInContext("MCFG=" + JSON.stringify(MC), ctx);
  const maxFor = (sessionId, subjectId) => {
    const w = sessions.find((s) => s.id === sessionId); const n = Number(w.week_label.replace("회", ""));
    const c = MC[roundOfN(n)]; const k = SK[nameOf[subjectId]];
    return (c && c[k]) || MDEF[k];
  };
  // 학생
  const students = [];
  for (let i = 0; i < ri(18, 30); i++) students.push({ id: "s" + i, student_id: "s" + i, name: "학생" + pad(i), name_no: 0, plan: pick(["A", "B", "C"]), cur: pick(["가", "나"]), hope1: rnd() < 0.7 ? pick(SCHOOL_NAMES) : "", hope2: rnd() < 0.5 ? pick(SCHOOL_NAMES) : "" });
  // 합산 순서를 같게: 반 → 이름 순(W-HUB 는 수강생을 이 순서로 합산, 원본은 입력 순서라 같은 순서를 주었다)
  students.sort((x, y) => x.plan.localeCompare(y.plan) || x.name.localeCompare(y.name));
  // 기록 (W-HUB 형식) + 원본 문서
  const whRecs = []; const docs = {};
  const putDoc = (n, cls, field, v) => { const id = `n${n}_${cls}`; (docs[id] = docs[id] || { n, cls })[field] = v; };
  const density = 0.5 + rnd() * 0.5;
  for (const n of weeksN) for (const st of students) for (const sub of SUBJ7) {
    if (rnd() > density) continue;
    const isMath = MATH3.includes(sub);
    const nrec = isMath && n !== 20 && rnd() < 0.3 ? 2 : 1;
    for (let q = 0; q < nrec; q++) {
      const sess = sessOfWeek[n][Math.min(q, sessOfWeek[n].length - 1)];
      const rec = { session_id: sess.id, student_id: st.id, subject_id: idOf[sub], att: null, book: null, beh: null, nt: null, hw: null, act: null, test: null, mock: null };
      if (n !== 20) {
        if (rnd() < 0.6) rec.att = pick(["출석", "출석", "출석", "지각", "결석"]);
        if (rnd() < 0.3) rec.book = true;
        if (rnd() < 0.4) rec.beh = ri(0, 3);
        if (rnd() < 0.4) rec.nt = pick([0, 0, 1, 2]);
        if (rnd() < 0.6) rec.hw = pick(["A", "B", "C", "D"]);
        if (rnd() < 0.4) rec.act = ri(0, 4);
        if (rnd() < 0.6) rec.test = r1(rnd() * 100);
      }
      if (sess.mock && rnd() < 0.85 && q === 0) rec.mock = r1(rnd() * maxFor(sess.id, idOf[sub]));
      if (Object.values(rec).slice(3).every((v) => v == null)) continue;
      whRecs.push(rec);
      const key = SK[sub] + (q === 1 ? "2" : "");
      for (const [f, v] of [["att", rec.att], ["book", rec.book ? 1 : null], ["beh", rec.beh], ["nt", rec.nt], ["hw", rec.hw], ["act", rec.act], ["test", rec.test]])
        if (v != null) putDoc(n, st.plan, `${st.id}__${key}__${f}`, v);
      if (rec.mock != null) putDoc(n, st.plan, `${st.id}__${SK[sub]}__mock`, rec.mock);
    }
  }
  ctx.REC = docs; ctx.shown = () => students; ctx.STU = students;
  const docList = Object.values(docs);
  // 커트라인 (회차 → 그룹 → 값/빈칸)
  const CUTorig = {}, cutWh = {};
  for (let m = 1; m <= 11; m++) if (rnd() < 0.8) {
    CUTorig[m] = {}; cutWh[m] = {};
    for (let g = 0; g < 4; g++) if (rnd() < 0.8) { const v = rnd() < 0.15 ? "" : r1(60 + rnd() * 120); CUTorig[m]["g" + g] = v; cutWh[m][g] = v === "" ? null : v; }
  }
  vm.runInContext("CUT=" + JSON.stringify(CUTorig), ctx);
  // 사후관리 기록
  const kinds = ["보충수업", "학생 상담", "학부모 상담", "과제 재제출", "기타"];
  const FU = [];
  for (let i = 0; i < ri(0, 80); i++) { const dd = new Date(Date.UTC(Y, 0, 1 + ri(0, 180))); FU.push({ id: "f" + i, sid: pick(students).id, cls: "A", subj: pick(["hr", "alg", "phy"]), teacher: "x", date: dd.toISOString().slice(0, 10), type: pick(kinds), text: "t" }); }
  vm.runInContext("FU=" + JSON.stringify(FU), ctx);

  const rules = { weights: { att: 5, book: 5, beh: 5, act: 5, hw: 10, test: 20, mock: 50 }, hw_scale: { A: 100, B: 60, C: 20, D: 0 }, note_penalty: 2, cat_weights: { 수학: 60, 과학: 40 } };
  const { weeks } = E.weeksOf(sessions);
  const mockWeeks = weeks.filter((w) => w.mock);
  eq(mockWeeks.length, 11, "모의 주차 수");
  const wins = F.windowsOf(weeks, `${Y}-06-30`);

  for (const cls of ["A", "B", "C"]) {
    const L0 = students.filter((s) => s.plan === cls);
    for (const maxMock of [null, 3, 6, 9]) {
      const maxN = maxMock == null ? 99 : sessByMock[maxMock]; // 원본 maxN(주차 n)
      const upto = maxMock == null ? undefined : weekNo(maxN);
      const oe = O("computeEval")(L0, docList, maxN);
      let sess = sessions; if (upto != null) { const { weekOf } = E.weeksOf(sessions); sess = sessions.filter((s) => weekOf.get(s.id) <= upto); }
      const ids = new Set(L0.map((s) => s.id));
      const ne = E.evaluate({ rules, subjects, sessions: sess, students: L0.map((s) => ({ student_id: s.id, name: s.name, name_no: 0 })), records: whRecs.filter((r) => ids.has(r.student_id)), maxOf: maxFor });
      const tag = `[묶음${bundle} ${cls}반 ${maxMock ?? "전체"}]`;
      // 평가 계산
      eq(Object.keys(oe.by).length, ne.rows.length, tag + " 학생 수");
      for (const nr of ne.rows) {
        const or = oe.by[nr.student_id];
        for (const sb of subjects) eq(or.sub[sb.name], nr.sub[sb.id] ?? null, `${tag} ${nr.name} ${sb.name} 종합`);
        for (const k of ["math", "sci", "final", "mockMath", "mockSci", "mockRecent", "note", "ntM", "ntS", "rank"]) eq(or[k] ?? null, nr[k] ?? null, `${tag} ${nr.name} ${k}`);
        eq(JSON.stringify(Object.keys(or.raw).map(Number)), JSON.stringify(Object.keys(nr.raw).map(Number)), `${tag} ${nr.name} raw 회차(수학·과학 둘 다 있는 회차만)`);
        eq(or.weak, nr.weak ? nameOf[nr.weak] : "", `${tag} ${nr.name} weak`);
        eq(or.trend.length, nr.trend.length, `${tag} ${nr.name} trend 길이`);
        or.trend.forEach((t, i) => { for (const k of ["round", "math", "sci", "comp"]) eq(t[k], nr.trend[i]?.[k], `${tag} ${nr.name} trend ${k}`); });
        for (const k of ["att", "hw", "test"]) eq(or.agg[k], nr.agg[k], `${tag} ${nr.name} agg.${k}`);
        eq(or.agg.act, nr.agg.act, `${tag} ${nr.name} agg.act`);
      }
      for (const k of ["math", "sci", "final", "mockMath", "mockSci", "mockRecent", "note", "ntM", "ntS", "test", "hw", "act", "att"]) eq(oe.st[k] ?? null, ne.st[k] ?? null, `${tag} st.${k}`);
      for (const m of Object.keys(oe.st.round)) eq(oe.st.round[m].comp, ne.st.round[m]?.comp, `${tag} st.round.${m}`);
      eq(Object.keys(oe.st.round).length, Object.keys(ne.st.round).length, tag + " st.round 개수");

      // 커트라인·1지망 판단
      const hopeOf = Object.fromEntries(L0.map((s) => [s.id, s]));
      for (const nr of ne.rows) {
        const or = oe.by[nr.student_id];
        const oadm = O("admission")(or, CUTorig);
        const nadm = A.admission(nr.trend, cutWh);
        oadm.forEach((a, gi) => { for (const k of ["cut", "stu", "m"]) eq(a[k], nadm[gi][k], `${tag} ${nr.name} adm g${gi}.${k}`); eq(a.pv ? a.pv[1] : null, nadm[gi].pv, `${tag} adm pv`); eq(JSON.stringify(a.rounds ?? null), JSON.stringify(nadm[gi].rounds ?? null), `${tag} adm rounds`); });
        const orec = O("recommend")(oadm), nrec = A.recommend(nadm);
        eq(orec ? orec.gi : null, nrec ? nrec.gi : null, `${tag} recommend`);
        eq(or.hope1, hopeOf[nr.student_id].hope1, "hope1");
        eq(O("grpOf")(or.hope1), A.grpOf(or.hope1), "grpOf");
        // 강점·보완·실행 계획·총평(1~3차)
        if (or.final == null) continue;
        const osw = vm.runInContext("(function(r,st){return strengths(r,st)})", ctx)(or, oe.st), nsw = R.strengths(nr, ne.st, subjects);
        for (const side of ["good", "bad"]) {
          eq(osw[side].length, nsw[side].length, `${tag} ${nr.name} strengths.${side} 개수`);
          osw[side].forEach((x, i) => { eqText(x.t, nsw[side][i]?.t ?? "", `${tag} ${nr.name} sw ${side} t`); eq(x.s, nsw[side][i]?.s, `${tag} sw s`); eq(x.g ?? null, nsw[side][i]?.g ?? null, `${tag} sw g`); eq(x.d, nsw[side][i]?.d, `${tag} sw d`); });
        }
        const TT2 = O("TT2"), SN = O("SN");
        const tch = (subId) => { const n = nameOf[subId]; return MATH3.includes(n) ? TT2(cls, n) : SN[n]; };
        const oplan = vm.runInContext("actionPlan", ctx)(or, oe.st, cls, oadm), nplan = R.actionPlan(nr, ne.st, nadm, subjects, or.hope1, tch);
        eqText(JSON.stringify(oplan), JSON.stringify(nplan), `${tag} ${nr.name} actionPlan`);
        for (const k of [1, 2, 3]) {
          eqText(O("summaryText")(or, oe.st, oadm, k), R.summaryText(nr, ne.st, nadm, k, subjects, or.hope1), `${tag} ${nr.name} summaryText k${k}`);
        }
      }
    }
  }

  // 사후관리 한 줄
  for (const st of students) for (const k of [1, 2, 3]) {
    const o = O("fuSummary")(st.id, k);
    const n = R.fuSummary(st.id, k, wins, FU.map((f) => ({ student_id: f.sid, on_date: f.date, kind: f.type })));
    eq(o ? o.text : null, n, `[묶음${bundle}] fuSummary ${st.id} k${k}`);
  }
  // 기간
  for (const k of [1, 2, 3]) { const w = O("fuWin")(k); const nw = wins.find((x) => x.k === k); eq(w.from, nw.from, "win.from k" + k); if (k < 3) eq(w.to, nw.to, "win.to k" + k); /* 마지막 기간 끝은 B2 에서 학기 끝나는 날 포함으로 일부러 다름 */ eq(w.label, nw.label, "win.label k" + k); }

  // 모의고사 성적표(전체 학생)
  const { weekOf } = E.weeksOf(sessions);
  for (let m = 1; m <= 11; m++) {
    const S = O("mockStats")(m);
    const n = sessByMock[m], w = weekNo(n);
    const last = new Map(); // (학생,과목) → 나중 회차 값
    for (const r of [...whRecs].sort((a, b) => (sessions.find((s) => s.id === a.session_id).on_date).localeCompare(sessions.find((s) => s.id === b.session_id).on_date))) {
      if (r.mock != null && weekOf.get(r.session_id) === w) last.set(r.student_id + ":" + r.subject_id, { student_id: r.student_id, subject_id: r.subject_id, value: r.mock });
    }
    const max = {}; for (const sb of subjects) max[sb.id] = maxFor(sessOfWeek[n][0].id, sb.id);
    const N = R.mockStats({ students: students.map((s) => s.id), subjects, recs: [...last.values()], max, cw: { m: 60, s: 40 } });
    const tag = `[묶음${bundle} 모의${m}]`;
    eq(S.cnt, N.cnt, tag + " 인원"); eq(S.mx, N.mx, tag + " mx"); eq(S.sx, N.sx, tag + " sx");
    for (const k of ["ms", "ss", "tot", "conv", "cm", "cs"]) { eq(S[k].avg, N[k].avg, `${tag} ${k} avg`); eq(S[k].vals.length, N[k].vals.length, `${tag} ${k} n`); }
    for (const sb of subjects) eq(S.sub[sb.name].avg, N.sub[sb.id].avg, `${tag} ${sb.name} avg`);
    for (const st of students) {
      const o = S.by[st.id], q = N.by[st.id];
      eq(!!o, !!q, tag + " 학생 있음");
      if (!o) continue;
      for (const k of ["ms", "ss", "tot", "cm", "cs", "conv"]) eq(o[k] ?? null, q[k] ?? null, `${tag} ${st.id} ${k}`);
      for (const sb of subjects) eq(o[sb.name] ?? null, q[sb.id] ?? null, `${tag} ${st.id} ${sb.name}`);
      if (o.conv != null) { eq(S.rank(o.conv), N.rank(q.conv), tag + " 석차"); eq(O("pctOf")(S.conv.vals, o.conv), R.pctOf(N.conv.vals, q.conv), tag + " 백분위"); }
      if (o.ms != null) eq(O("pctOf")(S.ms.vals, o.ms), R.pctOf(N.ms.vals, q.ms), tag + " 수학 백분위");
    }
  }
}
console.log(`확인 ${checks}건, 차이 ${fails}건 (숫자는 비트 단위, 글자는 한 글자 단위로 비교)`);
process.exit(fails ? 1 : 0);
