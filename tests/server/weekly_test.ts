// 주말반 평가 서버 시험 (로컬 Postgres :5433, db_reset 후)
import { deepStrictEqual } from "node:assert";
const eq = (a: unknown, b: unknown, m?: string) => deepStrictEqual(a, b, m);
import { googleToken, serveJwks, TEST_CLIENT_ID, TEST_ISSUER } from "./fake_google.ts";

const JWKS_PORT = 8095;
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
let owner = "", tch = "", onlyClass = "";
const I: J = {};

Deno.test({ name: "준비: 과정·회차 칸·수강생, 선생님 권한(성적·주말반 입력만)", ...opts, fn: async () => {
  owner = await login("owner@test.kr");
  await login("t@test.kr"); await login("c@test.kr");
  await call({ action: "userSave", token: owner, email: "t@test.kr", status: "approved", memberships: [{ workspace_id: "weiz", area: "scores_weekly", role: "editor" }] });
  await call({ action: "userSave", token: owner, email: "c@test.kr", status: "approved", memberships: [{ workspace_id: "weiz", area: "class", role: "editor" }] });
  tch = await login("t@test.kr"); onlyClass = await login("c@test.kr");
  await W(owner, "classSetup", { kind: "course", name: "과정" });
  I.course = (await W(owner, "classMeta")).json.courses[0].id;
  await W(owner, "classSetup", { kind: "term", course_id: I.course, name: "1차" });
  await W(owner, "classSetup", { kind: "subject", course_id: I.course, name: "대수", category: "수학" });
  await W(owner, "classSetup", { kind: "class", course_id: I.course, name: "A반" });
  await W(owner, "classSetup", { kind: "class", course_id: I.course, name: "B반" });
  const m = (await W(owner, "classMeta")).json;
  I.term = m.terms[0].id; I.sub = m.subjects[0].id; I.A = m.classes[0].id; I.B = m.classes[1].id;
  const d = (await W(owner, "sessionSave", { term_id: I.term, on_date: "2026-09-05", start_t: "18:30", end_t: "21:30", cells: [{ class_id: I.A, subject_id: I.sub }, { class_id: I.B, subject_id: I.sub }] })).json;
  I.sess = d.sessions[0];
  for (const n of ["가학생", "나학생"]) {
    const s = (await W(owner, "studentSave", { name: n })).json;
    await W(owner, "rosterAdd", { course_id: I.course, student_ids: [s.id] });
    const r = (await W(owner, "rosterList", { course_id: I.course })).json.rows.find((x: J) => x.student_id === s.id);
    await W(owner, "rosterSave", { course_id: I.course, student_id: s.id, ver: r.ver, class_id: I.A });
    I[n] = s.id;
  }
}});

Deno.test({ name: "권한: 성적 권한만 있어도 시간표는 읽지만 고치지는 못함", ...opts, fn: async () => {
  eq((await W(tch, "classMeta")).status, 200);
  eq((await W(tch, "classTerm", { term_id: I.term })).json.sessions.length, 1);
  eq((await W(tch, "sessionSave", { term_id: I.term, on_date: "2026-09-12" })).status, 403);
  eq((await W(tch, "rosterList", { course_id: I.course })).status, 403, "수강생 명부(연락처 포함)는 수업 권한");
  await login("n@test.kr");
  await call({ action: "userSave", token: owner, email: "n@test.kr", status: "approved", memberships: [{ workspace_id: "weiz", area: "students", role: "viewer" }] });
  eq((await W(await login("n@test.kr"), "classMeta")).status, 403);
}});

Deno.test({ name: "입력표: 칸마다 저장, 값 검사, 붙여넣기, 입력 현황", ...opts, fn: async () => {
  const cell = { session_id: I.sess.id, class_id: I.A };
  let s = (await W(tch, "weeklySheet", cell)).json;
  eq([s.info.subject, s.info.class_name, s.students.length, s.records.length], ["대수", "A반", 2, 0]);
  eq((await W(onlyClass, "recordSave", { ...cell, student_id: I.가학생, field: "att", value: "지각" })).status, 403, "수업 권한만으로는 성적 입력 못 함");
  eq((await W(tch, "recordSave", { ...cell, student_id: I.가학생, field: "att", value: "지각" })).json.ver, 1);
  eq((await W(tch, "recordSave", { ...cell, student_id: I.가학생, field: "hw", value: "B" })).json.ver, 2);
  eq((await W(tch, "recordSave", { ...cell, student_id: I.가학생, field: "test", value: 87.25 })).json.value, 87.3);
  for (const [field, value] of [["test", 101], ["hw", "E"], ["att", "조퇴"], ["beh", -1], ["nt", 1.5]]) {
    eq((await W(tch, "recordSave", { ...cell, student_id: I.가학생, field, value })).status, 400, `${field}=${value}`);
  }
  eq((await W(tch, "recordSave", { ...cell, student_id: I.가학생, field: "mock", value: 50 })).status, 400, "모의 회차가 아니면 모의 점수 거부");
  let st = (await W(tch, "weeklyStatus", { term_id: I.term })).json.rows.sort((a: J, b: J) => a.class_id - b.class_id);
  eq(st.map((r: J) => [r.total, r.filled]), [[2, 1], [0, 0]], "빈 칸(출석 기본값)만 있는 학생은 입력 안 한 것으로");
  // 붙여넣기: 이름으로 / 순서대로, 하나라도 틀리면 전부 취소
  s = (await W(tch, "recordsPaste", { ...cell, field: "test", rows: [{ student_id: I.가학생, value: 70 }, { student_id: I.나학생, value: 80 }] })).json;
  eq(s.records.map((r: J) => r.test).sort(), [70, 80]);
  eq((await W(tch, "recordsPaste", { ...cell, field: "test", rows: [{ student_id: I.가학생, value: 90 }, { student_id: I.나학생, value: 101 }] })).status, 400);
  eq((await W(tch, "weeklySheet", cell)).json.records.map((r: J) => r.test).sort(), [70, 80], "틀린 값이 섞이면 앞의 값도 안 들어감");
  eq((await W(tch, "recordsPaste", { ...cell, field: "book", rows: [{ student_id: I.가학생, value: 1 }] })).status, 400);
  st = (await W(tch, "weeklyStatus", { term_id: I.term })).json.rows.sort((a: J, b: J) => a.class_id - b.class_id);
  eq(st.map((r: J) => [r.total, r.filled]), [[2, 2], [0, 0]]);
}});

Deno.test({ name: "모의 회차·만점, 시간표를 고쳐도 성적은 지켜짐", ...opts, fn: async () => {
  const cell = { session_id: I.sess.id, class_id: I.A };
  const cells = [{ class_id: I.A, subject_id: I.sub, note: "교사 바뀜" }, { class_id: I.B, subject_id: I.sub }];
  const d = (await W(owner, "sessionSave", { term_id: I.term, id: I.sess.id, ver: I.sess.ver, on_date: "2026-09-05", start_t: "18:30", end_t: "21:30", mock: true, cells })).json;
  I.sess = d.sessions[0];
  eq((await W(tch, "weeklySheet", cell)).json.records.length, 2, "칸 내용을 고쳐도 입력된 성적 유지");
  eq((await W(tch, "weeklySheet", cell)).json.info.mock_max, null, "만점 미정");
  eq((await W(tch, "recordSave", { ...cell, student_id: I.나학생, field: "mock", value: 58 })).json.value, 58, "만점 미정이어도 원점수는 넣을 수 있음");
  const mm = { term_id: I.term, session_id: I.sess.id, subject_id: I.sub };
  eq((await W(tch, "mockMaxSave", { ...mm, max_score: 60 })).status, 403, "만점은 관리 권한(원장)만");
  eq((await W(owner, "mockMaxSave", { ...mm, max_score: 50 })).status, 400, "이미 넣은 원점수(58)보다 작은 만점은 거부");
  const list = (await W(owner, "mockMaxSave", { ...mm, max_score: 60 })).json.rows;
  eq(list.map((r: J) => [r.subject, r.max_score]), [["대수", 60]]);
  eq((await W(tch, "mockMaxList", { term_id: I.term })).json.rows.length, 1, "선생님은 보기만");
  eq((await W(owner, "mockMaxSave", { ...mm, subject_id: 999999, max_score: 60 })).status, 400, "그 회차에 없는 과목");
  eq((await W(tch, "recordSave", { ...cell, student_id: I.가학생, field: "mock", value: 61 })).status, 400, "만점 초과");
  eq((await W(tch, "recordSave", { ...cell, student_id: I.가학생, field: "mock", value: 55.5 })).json.value, 55.5);
  eq((await W(tch, "recordsPaste", { ...cell, field: "mock", rows: [{ student_id: I.가학생, value: 61 }] })).status, 400, "붙여넣기도 만점 검사");
  eq((await W(owner, "sessionSave", { term_id: I.term, id: I.sess.id, ver: I.sess.ver, on_date: "2026-09-05", cells: [{ class_id: I.B, subject_id: I.sub }] })).status, 400, "성적 있는 반 칸 비우기 막음");
  eq((await W(owner, "sessionSave", { term_id: I.term, id: I.sess.id, ver: I.sess.ver, on_date: "2026-09-05", kind: "holiday" })).status, 400, "휴강으로 바꾸기 막음");
  eq((await W(owner, "sessionDelete", { term_id: I.term, id: I.sess.id })).status, 400, "성적 있는 회차 삭제 막음");
  eq((await W(tch, "weeklySheet", cell)).json.info.mock_max, 60);
  // 회차 만점을 지우면 과목 기본 만점
  await W(owner, "mockMaxSave", { ...mm, max_score: "" });
  const base = { course_id: I.course, weights: { att: 5, book: 5, beh: 5, act: 5, hw: 10, test: 20, mock: 50 }, hw_scale: { A: 100, B: 60, C: 20, D: 0 }, note_penalty: 2, alert: { drop: 15, gap: 20, rep: 2, days: 7 } };
  eq((await W(owner, "rulesSave", { ...base, mock_default: { [I.sub]: 40 } })).json.rules.mock_default, { [String(I.sub)]: 40 });
  eq((await W(tch, "weeklySheet", cell)).json.info.mock_max, 40);
  eq((await W(owner, "rulesSave", { ...base, mock_default: { 999999: 40 } })).status, 400, "다른 과정 과목");
}});

Deno.test({ name: "평가 규칙: 기본값, 관리 권한만 저장", ...opts, fn: async () => {
  eq((await W(tch, "rulesGet", { course_id: I.course })).json.rules.weights.mock, 50);
  const body = { course_id: I.course, weights: { att: 5, book: 5, beh: 5, act: 5, hw: 10, test: 30, mock: 40 }, hw_scale: { A: 100, B: 70, C: 30, D: 0 }, note_penalty: 2, alert: { drop: 15, gap: 20, rep: 2, days: 7 } };
  eq((await W(tch, "rulesSave", body)).status, 403);
  eq((await W(owner, "rulesSave", body)).json.rules.weights.test, 30);
  eq((await W(tch, "rulesGet", { course_id: I.course })).json.rules.mock_default, {}, "기본 만점 안 보내면 비움");
  eq((await W(owner, "rulesSave", { ...body, weights: { ...body.weights, test: -1 } })).status, 400);
}});

Deno.test({ name: "평가 대시보드: 반 계산, 권한", ...opts, fn: async () => {
  const d = (await W(tch, "evalClass", { term_id: I.term, class_id: I.A })).json;
  eq(d.rows.length, 2);
  const ga = d.rows.find((r: J) => r.student_id === I.가학생);
  eq([ga.rank > 0, ga.final != null, Object.keys(ga.sub)], [true, true, [String(I.sub)]]);
  eq(d.cat_weights, { 수학: 60, 과학: 40 });
  eq((await W(onlyClass, "evalClass", { term_id: I.term, class_id: I.A })).status, 403, "수업 권한만으로는 평가 못 봄");
  eq((await W(tch, "evalClass", { term_id: I.term, class_id: 999999 })).status, 400);
}});

Deno.test({ name: "담임·집중관리·조치 기록", ...opts, fn: async () => {
  eq((await call({ action: "staffSave", token: owner, ws: "weiz", name: "김담임", email: "t@test.kr" })).json.ok, true);
  const staff = (await W(owner, "classMeta")).json.staff.find((x: J) => x.name === "김담임");
  I.staff = staff.id;
  eq((await W(tch, "classSetup", { kind: "class", course_id: I.course, id: I.A, name: "A반", homeroom_staff_id: I.staff })).status, 403, "담임은 수업 관리 권한");
  let m = (await W(owner, "classSetup", { kind: "class", course_id: I.course, id: I.A, name: "A반", homeroom_staff_id: I.staff })).json;
  eq(m.classes.find((c: J) => c.id === I.A).homeroom_staff_id, I.staff);
  m = (await W(owner, "classSetup", { kind: "class", course_id: I.course, id: I.A, name: "A반" })).json;
  eq(m.classes.find((c: J) => c.id === I.A).homeroom_staff_id, I.staff, "담임 칸을 안 보내면 그대로");
  eq((await W(owner, "classSetup", { kind: "class", course_id: I.course, id: I.A, name: "A반", homeroom_staff_id: "00000000-0000-0000-0000-000000000000" })).status, 400);
  let f = (await W(tch, "focusData", { term_id: I.term })).json;
  eq([f.k, f.wins.length, f.wins[0].label, f.me_staff], [0, 1, "지금까지", I.staff], "모의 3회 미만 → 지금까지");
  const A = f.classes.find((c: J) => c.id === I.A);
  eq([A.homeroom_staff_id, A.focus.length, A.focus[0].score <= A.focus[1].score], [I.staff, 2, true], "최종 낮은 순");
  const fu = { term_id: I.term, student_id: I.가학생, subject_id: I.sub, staff_id: I.staff, on_date: "2026-09-08", kind: "보충수업", body: "오답 보충 40분" };
  eq((await W(onlyClass, "followupSave", fu)).status, 403, "수업 권한만으로는 기록 못 함");
  for (const bad of [{ kind: "숙제" }, { body: "" }, { on_date: "9월" }, { subject_id: 999999 }, { student_id: "00000000-0000-0000-0000-000000000000" }]) {
    eq((await W(tch, "followupSave", { ...fu, ...bad })).status, 400, JSON.stringify(bad));
  }
  const id1 = (await W(tch, "followupSave", fu)).json.id;
  const id2 = (await W(owner, "followupSave", { ...fu, subject_id: null, kind: "학부모 상담", body: "전화 15분" })).json.id;
  f = (await W(tch, "focusData", { term_id: I.term })).json;
  eq(f.follows.map((x: J) => [x.kind, x.subject_id, x.staff_name]), [["보충수업", I.sub, "김담임"], ["학부모 상담", null, "김담임"]]);
  eq((await W(tch, "followupDelete", { id: id2 })).status, 403, "남이 쓴 기록은 관리 권한만 지움");
  eq((await W(tch, "followupDelete", { id: id1 })).json.ok, true);
  eq((await W(owner, "followupDelete", { id: id2 })).json.ok, true);
  eq((await W(tch, "focusData", { term_id: I.term })).json.follows.length, 0);
}});

Deno.test({ name: "과목 경보: 과제 C·D 2회 연속, 성적 입력 칸별, 조치하면 완료", ...opts, fn: async () => {
  const d = (await W(owner, "sessionSave", { term_id: I.term, on_date: "2026-09-12", start_t: "18:30", end_t: "21:30", cells: [{ class_id: I.A, subject_id: I.sub, staff_id: I.staff }] })).json;
  const s2 = d.sessions.find((x: J) => x.on_date === "2026-09-12");
  await W(tch, "recordSave", { session_id: I.sess.id, class_id: I.A, student_id: I.가학생, field: "hw", value: "C" });
  await W(tch, "recordSave", { session_id: s2.id, class_id: I.A, student_id: I.가학생, field: "hw", value: "D" });
  let r = (await W(tch, "alertsTerm", { term_id: I.term })).json;
  const a = r.alerts.find((x: J) => x.rs.some((y: J) => y.t === "hw"));
  eq([a.name, a.date, a.due, a.staff_id, a.rs.map((y: J) => y.x)], ["가학생", "2026-09-12", "2026-09-19", I.staff, ["과제 C·D 2회 연속"]]);
  eq(r.assign, [{ class_id: I.A, subject_id: I.sub, staff_id: I.staff }]);
  eq((await W(tch, "alertsTerm", { term_id: I.term, session_id: s2.id, class_id: I.A })).json.alerts.map((x: J) => x.id), [a.id], "그 칸의 이번 회 경보");
  eq((await W(tch, "alertsTerm", { term_id: I.term, session_id: I.sess.id, class_id: I.A })).json.alerts.length, 0, "지난 회에는 없음");
  eq((await W(onlyClass, "alertsTerm", { term_id: I.term })).status, 403);
  await W(tch, "followupSave", { term_id: I.term, student_id: I.가학생, subject_id: I.sub, staff_id: I.staff, on_date: "2026-09-01", kind: "학생 상담", body: "상담", alert_key: a.id });
  r = (await W(tch, "alertsTerm", { term_id: I.term })).json;
  eq(r.alerts.find((x: J) => x.id === a.id).st, "done", "경보에서 쓴 기록이면 조치 완료");
}});

Deno.test({ name: "정리", ...opts, fn: async () => { await jwks.shutdown(); } });
