// 커트라인·1지망·학생 리포트·모의고사 성적표·엑셀 백업 서버 시험 (로컬 Postgres :5433, db_reset 후)
// 숫자는 손으로 계산한 값: 만점 대수 40·물리 30(과목 기본 만점), 수학:과학 60:40 → 모의 종합 = 2×(수학%×0.6 + 과학%×0.4)
//   가 = 대수 40·물리 30 → 100%·100% → 200   나 = 20·15 → 50%·50% → 100   다 = 30·24 → 75%·80% → 154
import { deepStrictEqual } from "node:assert";
const eq = (a: unknown, b: unknown, m?: string) => deepStrictEqual(a, b, m);
import { googleToken, serveJwks, TEST_CLIENT_ID, TEST_ISSUER } from "./fake_google.ts";

const JWKS_PORT = 8094;
Deno.env.set("SUPABASE_DB_URL", "postgres://postgres@localhost:5433/postgres");
Deno.env.set("WHUB_GOOGLE_JWKS_URL", `http://localhost:${JWKS_PORT}/certs`);
Deno.env.set("WHUB_GOOGLE_ISSUER", TEST_ISSUER);
Deno.env.set("WHUB_GOOGLE_CLIENT_ID", TEST_CLIENT_ID);
Deno.env.set("WHUB_OWNER_EMAILS", "owner@test.kr");
Deno.env.set("WHUB_ALLOWED_ORIGINS", "https://ai-aca.github.io");
const jwks = serveJwks(JWKS_PORT);
const { handle } = await import("../../supabase/functions/api/handler.ts");

// deno-lint-ignore no-explicit-any
type J = Record<string, any>;
async function call(body: J): Promise<{ status: number; json: J }> {
  const res = await handle(new Request("http://x/api", { method: "POST", headers: { origin: "https://ai-aca.github.io", "content-type": "application/json" }, body: JSON.stringify(body) }));
  return { status: res.status, json: await res.json() };
}
const login = async (email: string) => (await call({ action: "login", credential: await googleToken({ email, name: email }) })).json.token as string;
const opts = { sanitizeOps: false, sanitizeResources: false };
const W = (token: string, action: string, b: J = {}) => call({ action, token, ws: "weiz", ...b });
let owner = "", tch = "", viewer = "", onlyClass = "";
const I: J = {};
const near = (a: number, b: number, m: string) => eq(Math.abs(a - b) < 1e-9, true, `${m}: ${a} ≠ ${b}`);

Deno.test({ name: "준비: 모의 3주(토 수학·일 과학), 학생 3명, 모의 원점수", ...opts, fn: async () => {
  owner = await login("owner@test.kr");
  for (const e of ["t@test.kr", "v@test.kr", "c@test.kr"]) await login(e);
  await call({ action: "userSave", token: owner, email: "t@test.kr", status: "approved", memberships: [{ workspace_id: "weiz", area: "scores_weekly", role: "editor" }] });
  await call({ action: "userSave", token: owner, email: "v@test.kr", status: "approved", memberships: [{ workspace_id: "weiz", area: "scores_weekly", role: "viewer" }] });
  await call({ action: "userSave", token: owner, email: "c@test.kr", status: "approved", memberships: [{ workspace_id: "weiz", area: "class", role: "editor" }] });
  tch = await login("t@test.kr"); viewer = await login("v@test.kr"); onlyClass = await login("c@test.kr");
  await W(owner, "classSetup", { kind: "course", name: "과정" });
  I.course = (await W(owner, "classMeta")).json.courses[0].id;
  await W(owner, "classSetup", { kind: "term", course_id: I.course, name: "1차", starts_on: "2026-09-01", ends_on: "2026-12-31" });
  await W(owner, "classSetup", { kind: "subject", course_id: I.course, name: "대수", category: "수학" });
  await W(owner, "classSetup", { kind: "subject", course_id: I.course, name: "물리", category: "과학" });
  await W(owner, "classSetup", { kind: "class", course_id: I.course, name: "A반" });
  await call({ action: "staffSave", token: owner, ws: "weiz", name: "김수학" });
  await call({ action: "staffSave", token: owner, ws: "weiz", name: "이과학" });
  const m = (await W(owner, "classMeta")).json;
  I.term = m.terms[0].id; I.A = m.classes[0].id;
  I.mathSub = m.subjects.find((s: J) => s.name === "대수").id; I.sciSub = m.subjects.find((s: J) => s.name === "물리").id;
  I.sMath = m.staff.find((s: J) => s.name === "김수학").id; I.sSci = m.staff.find((s: J) => s.name === "이과학").id;
  I.sess = [];
  for (const [i, d] of ["2026-09-05", "2026-09-19", "2026-10-03"].entries()) {
    const sat = (await W(owner, "sessionSave", { term_id: I.term, on_date: d, start_t: "10:00", end_t: "12:00", week_label: `${i + 1}주`, mock: true, cells: [{ class_id: I.A, subject_id: I.mathSub, staff_id: I.sMath }] })).json;
    const d2 = new Date(Date.parse(d + "T00:00:00Z") + 86400e3).toISOString().slice(0, 10);
    const sun = (await W(owner, "sessionSave", { term_id: I.term, on_date: d2, start_t: "10:00", end_t: "12:00", week_label: `${i + 1}주`, mock: true, cells: [{ class_id: I.A, subject_id: I.sciSub, staff_id: I.sSci }] })).json;
    I.sess.push({ math: sat.sessions.find((x: J) => x.on_date === d).id, sci: sun.sessions.find((x: J) => x.on_date === d2).id });
  }
  const base = { course_id: I.course, weights: { att: 5, book: 5, beh: 5, act: 5, hw: 10, test: 20, mock: 50 }, hw_scale: { A: 100, B: 60, C: 20, D: 0 }, note_penalty: 2, alert: { drop: 15, gap: 20, rep: 2, days: 7 } };
  eq((await W(owner, "rulesSave", { ...base, mock_default: { [I.mathSub]: 40, [I.sciSub]: 30 } })).status, 200);
  const raw: Record<string, [number, number]> = { 가학생: [40, 30], 나학생: [20, 15], 다학생: [30, 24] };
  for (const n of Object.keys(raw)) {
    const s = (await W(owner, "studentSave", { name: n })).json;
    await W(owner, "rosterAdd", { course_id: I.course, student_ids: [s.id] });
    const r = (await W(owner, "rosterList", { course_id: I.course })).json.rows.find((x: J) => x.student_id === s.id);
    await W(owner, "rosterSave", { course_id: I.course, student_id: s.id, ver: r.ver, class_id: I.A });
    I[n] = s.id;
    for (const x of I.sess) {
      eq((await W(tch, "recordSave", { session_id: x.math, class_id: I.A, student_id: s.id, field: "mock", value: raw[n][0] })).status, 200);
      eq((await W(tch, "recordSave", { session_id: x.sci, class_id: I.A, student_id: s.id, field: "mock", value: raw[n][1] })).status, 200);
    }
  }
}});

Deno.test({ name: "커트라인: 관리 권한만, 0~200, 회차·그룹 검사, 빈 칸 저장", ...opts, fn: async () => {
  const put = (token: string, round: number, grp: number, value: unknown) => W(token, "cutSave", { term_id: I.term, round, grp, value });
  eq((await put(tch, 1, 0, 90)).status, 403, "입력 권한으로는 못 고침");
  eq((await put(viewer, 1, 0, 90)).status, 403);
  eq((await put(onlyClass, 1, 0, 90)).status, 403);
  for (const [r, g, v] of [[1, 0, 201], [1, 0, -1], [1, 0, "x"], [4, 0, 100], [0, 0, 100], [1, 4, 100], [1, -1, 100]] as [number, number, unknown][]) {
    eq((await put(owner, r, g, v)).status, 400, `${r}/${g}/${v}`);
  }
  eq((await put(owner, 1, 0, 90)).json.cut, { 1: { 0: 90 } });
  await put(owner, 2, 0, 110); await put(owner, 3, 0, 130);
  await put(owner, 1, 1, 160);
  const c = (await put(owner, 3, 1, "")).json.cut; // 빈 칸으로 저장 = 그 회차 줄은 있고 값은 없음
  eq(c, { 1: { 0: 90, 1: 160 }, 2: { 0: 110 }, 3: { 0: 130, 1: null } });
  eq((await put(owner, 1, 0, 95.25)).json.cut[1][0], 95.3, "소수 첫째 자리");
  await put(owner, 1, 0, 90);
}});

Deno.test({ name: "1·2지망: 입력 권한, 목록 학교만, 평가 결과에 판단이 붙음(손 계산)", ...opts, fn: async () => {
  const hp = (token: string, sid: string, field: string, value: string) => W(token, "hopeSave", { term_id: I.term, student_id: sid, field, value });
  eq((await hp(viewer, I["가학생"], "hope1", "서울과학고")).status, 403);
  eq((await hp(onlyClass, I["가학생"], "hope1", "서울과학고")).status, 403);
  eq((await hp(tch, I["가학생"], "hope1", "아무학교")).status, 400, "목록에 없는 학교");
  eq((await hp(tch, I["가학생"], "hope3", "서울과학고")).status, 400);
  eq((await hp(tch, "00000000-0000-0000-0000-000000000000", "hope1", "서울과학고")).status, 400, "수강생이 아님");
  eq((await hp(tch, I["가학생"], "hope1", "서울과학고")).json.value, "서울과학고");
  await hp(tch, I["나학생"], "hope1", "경기과학고"); await hp(tch, I["나학생"], "hope2", "인천과학예술영재학교");
  await hp(tch, I["다학생"], "hope1", "인천과학예술영재학교");
  const d = (await W(viewer, "evalClass", { term_id: I.term, class_id: I.A })).json;
  eq(d.groups, ["서울·경기·한과영", "인천·대구", "대전·세종", "광주"]);
  eq(d.cut[1], { 0: 90, 1: 160 });
  const by = (n: string) => d.rows.find((r: J) => r.student_id === I[n]);
  for (const [n, comp] of [["가학생", 200], ["나학생", 100], ["다학생", 154]] as [string, number][]) near(by(n).mockRecent, comp, n + " 모의 환산");
  // 그룹0 안전선 = (90+110+130)/3 = 110, 그룹1 = 160(1회만, 3회는 빈 칸), 그룹2·3 없음
  const g0 = by("가학생").adm[0];
  near(g0.cut, 110, "그룹0 안전선"); near(g0.m, 90, "가 차이"); eq(g0.pv, "안전"); eq(g0.rounds, [1, 2, 3]);
  eq(by("가학생").adm[1].rounds, [1], "빈 칸인 회차는 그 그룹에서 빠짐");
  eq([by("가학생").adm[2].cut, by("가학생").adm[2].pv], [null, null]);
  near(by("나학생").adm[0].m, -10, "나 차이"); eq(by("나학생").adm[0].pv, "근접", "−10 은 근접(경계)");
  near(by("나학생").adm[1].m, -60, "나 그룹1"); eq(by("나학생").adm[1].pv, "도전");
  near(by("다학생").adm[1].m, -6, "다 그룹1"); eq(by("다학생").adm[1].pv, "근접");
  // 1지망 판단: 지망 학교의 그룹 칸
  eq([by("가학생").h1.gname, by("가학생").h1.pv, by("나학생").h1.pv, by("다학생").h1.pv], ["서울·경기·한과영", "안전", "근접", "근접"]);
  // 우리 판단: 안전인 첫 그룹, 없으면 차이가 가장 큰 그룹
  eq([by("가학생").rec.gname, by("가학생").rec.pv], ["서울·경기·한과영", "안전"]);
  eq([by("나학생").rec.gname, by("나학생").rec.pv], ["서울·경기·한과영", "근접"]);
  eq((await W(onlyClass, "evalClass", { term_id: I.term, class_id: I.A })).status, 403);
  // 집중관리 반별 표에 1지망 판단
  const f = (await W(viewer, "focusData", { term_id: I.term, k: 1 })).json;
  const A = f.classes.find((c: J) => c.id === I.A);
  eq(A.focus.map((x: J) => [x.hope1, x.h1pv]), [["경기과학고", "근접"], ["인천과학예술영재학교", "근접"], ["서울과학고", "안전"]], "최종 낮은 순 + 1지망 판단");
}});

Deno.test({ name: "학생 리포트: 차수·성적표(평균·백분위)·지원 가능·총평 저장", ...opts, fn: async () => {
  eq((await W(onlyClass, "reportData", { term_id: I.term, class_id: I.A })).status, 403);
  const d = (await W(viewer, "reportData", { term_id: I.term, class_id: I.A, k: 1 })).json;
  eq([d.wins.length, d.k, d.mockCount, d.reports.length], [1, 1, 3, 3]);
  eq(d.wins[0].upto, 3, "1차 = 모의 3회(3주차)까지");
  const r = (n: string) => d.reports.find((x: J) => x.student_id === I[n]);
  const ga = r("가학생");
  eq([ga.rank, ga.n, ga.hope1, ga.hopeG], [1, 3, "서울과학고", [0, null]]);
  eq(ga.kpi.map((k: J) => k.l), ["모의고사 환산 총점 (200)", "모의고사 수학 (100)", "모의고사 과학 (100 환산)", "최종 종합점수"]);
  near(ga.kpi[0].v, 200, "가 환산"); near(ga.kpi[0].c, (200 + 100 + 154) / 3, "반 평균 환산"); near(ga.kpi[1].v, 100, "가 수학");
  eq(ga.chart.rounds, [1, 2, 3]); eq(ga.chart.cut, [{ round: 1, value: 90 }, { round: 2, value: 110 }, { round: 3, value: 130 }], "1지망(그룹0) 안전선 선");
  eq(ga.summary.saved, false);
  eq(ga.summary.text.startsWith("가학생 학생은 1차 기간(모의고사 1~3회) 모의고사 종합 평균 200.0점(200점 만점)으로 반 평균 151.3점보다 48.7점 높습니다. "), true, ga.summary.text);
  eq(ga.summary.text.includes("1지망(서울과학고)은 합격 안전선보다 90.0점 높아 '안전' 구간입니다."), true);
  eq(ga.care, null, "1차 리포트에는 사후관리 한 줄 없음");
  // 모의고사 성적표: 대수 원점수 40·20·30 → 평균 30, 백분위 (아래 2명 + 동점 절반)/3 = 83, 17, 50
  eq(ga.mock.map((m: J) => [m.round, m.date]), [[1, "9/5"], [2, "9/19"], [3, "10/3"]]);
  const row = (n: string, label: string) => r(n).mock[0].rows.find((x: J) => x.label === label).c;
  eq([row("가학생", "대수").v, row("가학생", "대수").max, row("가학생", "대수").pct], [40, 40, 83]);
  eq([row("나학생", "대수").pct, row("다학생", "대수").pct, row("가학생", "대수").avg], [17, 50, 30]);
  eq([row("가학생", "수학 합계").v, row("가학생", "과학 합계").max, row("가학생", "총점").max, row("가학생", "총점").v], [40, 30, 70, 70]);
  near(ga.mock[0].conv.v, 200, "환산 총점"); eq(ga.mock[0].conv.pct, 83); near(ga.mock[0].conv.avg, (200 + 100 + 154) / 3, "환산 평균");
  eq(ga.adm.length, 4); eq(ga.rec, { gname: "서울·경기·한과영", pv: "안전" });
  eq(ga.plan.length >= 1 && ga.plan.every((p: J) => p.t && p.a && p.h && p.goal), true, "실행 계획");
  // 과목 종합(모의 %가 m 일 때) = (출결·교재·태도 100×5×3 + 적극성 0×5 + 모의 m×50) / 가중치 합 70 = (1500 + 50m) / 70
  const tot = (m: number) => (1500 + 50 * m) / 70;
  eq(ga.bars.map((b: J) => b.name), ["대수", "물리"]);
  near(ga.bars[0].v, tot(100), "가 대수 종합"); near(ga.bars[0].avg, (tot(100) + tot(50) + tot(75)) / 3, "대수 반 평균");
  near(ga.bars[1].avg, (tot(100) + tot(50) + tot(80)) / 3, "물리 반 평균");
  // 총평: 입력 권한만 저장, 빈 문안이면 자동 문안으로
  const save = (token: string, body: string) => W(token, "reportTextSave", { term_id: I.term, student_id: I["가학생"], k: 1, body });
  eq((await save(viewer, "고친 총평")).status, 403);
  eq((await save(tch, "고친 총평")).json.saved, true);
  const g2 = (await W(viewer, "reportData", { term_id: I.term, class_id: I.A, k: 1 })).json.reports.find((x: J) => x.student_id === I["가학생"]);
  eq([g2.summary.text, g2.summary.saved, g2.summary.auto === ga.summary.auto], ["고친 총평", true, true]);
  eq((await save(tch, "")).json.saved, false);
  eq((await W(viewer, "reportData", { term_id: I.term, class_id: I.A, k: 1 })).json.reports.find((x: J) => x.student_id === I["가학생"]).summary.saved, false, "자동 문안으로 돌아감");
  eq((await W(tch, "reportTextSave", { term_id: I.term, student_id: I["가학생"], k: 10, body: "x" })).status, 400);
  eq((await W(tch, "reportData", { term_id: I.term, class_id: 999999, k: 1 })).status, 400);
}});

Deno.test({ name: "차수: 모의 3회 미만이면 없음, 6회면 2차에 지난 기간 사후관리 한 줄", ...opts, fn: async () => {
  await W(owner, "classSetup", { kind: "term", course_id: I.course, name: "2차", starts_on: "2027-01-01", ends_on: "2027-06-30" });
  const t2 = (await W(owner, "classMeta")).json.terms.find((t: J) => t.name === "2차").id;
  const e = (await W(viewer, "reportData", { term_id: t2, class_id: I.A })).json;
  eq([e.wins, e.reports, e.mockCount], [[], [], 0], "모의 회차가 없으면 차수 없음");
  eq((await W(viewer, "mockSheet", { term_id: t2 })).json.rounds, []);
  // 토요일 6주를 모두 모의로: 모의 3회째 1/16, 6회째 2/6 → 1차 기간 = 1/16 ~ 2/6 전
  const sats = ["2027-01-02", "2027-01-09", "2027-01-16", "2027-01-23", "2027-01-30", "2027-02-06"];
  for (const [i, d] of sats.entries()) {
    const sat = (await W(owner, "sessionSave", { term_id: t2, on_date: d, start_t: "10:00", end_t: "12:00", week_label: `${i + 1}주`, mock: true, cells: [{ class_id: I.A, subject_id: I.mathSub, staff_id: I.sMath }] })).json;
    const d2 = new Date(Date.parse(d + "T00:00:00Z") + 86400e3).toISOString().slice(0, 10);
    const sun = (await W(owner, "sessionSave", { term_id: t2, on_date: d2, start_t: "10:00", end_t: "12:00", week_label: `${i + 1}주`, mock: true, cells: [{ class_id: I.A, subject_id: I.sciSub, staff_id: I.sSci }] })).json;
    await W(tch, "recordSave", { session_id: sat.sessions.find((x: J) => x.on_date === d).id, class_id: I.A, student_id: I["가학생"], field: "mock", value: 30 + i });
    await W(tch, "recordSave", { session_id: sun.sessions.find((x: J) => x.on_date === d2).id, class_id: I.A, student_id: I["가학생"], field: "mock", value: 20 });
  }
  const fu = (on_date: string, kind: string) => W(tch, "followupSave", { term_id: t2, student_id: I["가학생"], subject_id: I.mathSub, staff_id: I.sMath, on_date, kind, body: "기록" });
  for (const [d, k] of [["2027-01-20", "보충수업"], ["2027-01-25", "보충수업"], ["2027-01-30", "학부모 상담"], ["2027-02-10", "학생 상담"], ["2027-01-10", "기타"]]) eq((await fu(d, k)).status, 200);
  const d = (await W(viewer, "reportData", { term_id: t2, class_id: I.A, k: 2 })).json;
  eq([d.wins.map((w: J) => [w.k, w.label]), d.k, d.mockCount], [[[1, "1/16 ~ 2/6"], [2, "2/6 ~ 6/30"]], 2, 6]);
  const ga = d.reports.find((x: J) => x.student_id === I["가학생"]);
  eq(ga.care, "지난 리포트 이후(1/16 ~ 2/6) 학원에서 보충수업 2회, 학부모 상담 1회를 진행했습니다.", "1차 기간 안의 기록만(2/10·1/10 제외)");
  eq(ga.chart.rounds, [1, 2, 3, 4, 5, 6]);
  eq(ga.summary.text.startsWith("가학생 학생은 2차 기간(모의고사 4~6회)"), true);
  const d1 = (await W(viewer, "reportData", { term_id: t2, class_id: I.A, k: 1 })).json;
  eq(d1.reports.find((x: J) => x.student_id === I["가학생"]).care, null);
}});

Deno.test({ name: "모의고사 성적표: 회차·반 거르기, 석차", ...opts, fn: async () => {
  eq((await W(onlyClass, "mockSheet", { term_id: I.term })).status, 403);
  const d = (await W(viewer, "mockSheet", { term_id: I.term, round: 2 })).json;
  eq([d.round, d.rounds.map((x: J) => [x.round, x.has]), d.cnt, d.mx, d.sx], [2, [[1, true], [2, true], [3, true]], 3, 40, 30]);
  eq(d.rows.map((x: J) => [x.rank, x.pconv]), [[1, 83], [2, 50], [3, 17]], "환산 총점 높은 순");
  near(d.avg.conv, (200 + 154 + 100) / 3, "평균");
  eq(d.rows[0].v[I.mathSub], 40);
  eq((await W(viewer, "mockSheet", { term_id: I.term })).json.round, 3, "기본 = 원점수가 있는 마지막 회차");
  eq((await W(viewer, "mockSheet", { term_id: I.term, round: 1, class_id: 999999 })).json.rows, [], "다른 반");
}});

Deno.test({ name: "엑셀 백업 자료: 시트 6개, 연락처 없음, 권한", ...opts, fn: async () => {
  eq((await W(onlyClass, "weeklyBackup", { term_id: I.term })).status, 403);
  // 연락처를 넣어 두고도 백업에는 안 나오는지
  const row = (await W(owner, "studentSave", { id: I["가학생"], name: "가학생", parent_phone: "010-1111-2222", student_phone: "010-3333-4444" })).json;
  void row;
  const d = (await W(viewer, "weeklyBackup", { term_id: I.term })).json;
  eq(d.sheets.map((s: J) => s.name), ["학생", "성적기록", "모의고사", "사후관리", "커트라인", "모의고사 만점"]);
  const sh = (n: string) => d.sheets.find((s: J) => s.name === n).rows;
  eq(sh("학생")[0], ["이름", "반", "센터", "학교", "입학연도", "1지망", "2지망", "비고"]);
  eq(sh("학생").length, 4);
  eq(JSON.stringify(d).includes("010-1111-2222") || JSON.stringify(d).includes("010-3333-4444"), false, "연락처는 백업에 넣지 않음");
  eq(sh("학생").find((r: J) => r[0] === "나학생").slice(5), ["경기과학고", "인천과학예술영재학교", ""]);
  eq(sh("성적기록").length, 1 + 18, "회차 3 × 학생 3 × 과목 2");
  eq(sh("성적기록")[0].slice(0, 5), ["주차", "날짜", "반", "학생", "과목"]);
  eq(sh("성적기록")[1].slice(0, 6), ["1주 (모의)", "2026-09-05", "A반", "가학생", "대수", "출석"]);
  eq(sh("모의고사")[0].slice(0, 5), ["회차", "반", "학생", "대수", "물리"]);
  eq(sh("모의고사").length, 1 + 9, "3회 × 3명");
  eq(sh("모의고사")[1].slice(0, 5), ["1회", "A반", "가학생", 40, 30]);
  eq(sh("커트라인")[0], ["회차", "서울·경기·한과영", "인천·대구", "대전·세종", "광주"]);
  eq(sh("커트라인")[1], ["1회", 90, 160, "", ""]); eq(sh("커트라인")[3], ["3회", 130, "", "", ""]);
  eq(sh("모의고사 만점")[1], ["1회", 40, 30]);
  eq(d.term, "1차");
}});

Deno.test({ name: "정리", ...opts, fn: async () => { await jwks.shutdown(); } });
