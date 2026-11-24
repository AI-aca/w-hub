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

Deno.test({ name: "입력표: 칸마다 저장, 값 검사, 모두 출석, 입력 현황", ...opts, fn: async () => {
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
  s = (await W(tch, "recordsAllPresent", cell)).json;
  eq(s.records.map((r: J) => [r.att]).sort(), [["지각"], ["출석"]], "이미 넣은 지각은 그대로");
  const st = (await W(tch, "weeklyStatus", { term_id: I.term })).json.rows.sort((a: J, b: J) => a.class_id - b.class_id);
  eq(st.map((r: J) => [r.total, r.filled]), [[2, 2], [0, 0]]);
}});

Deno.test({ name: "모의 회차·만점, 시간표를 고쳐도 성적은 지켜짐", ...opts, fn: async () => {
  const cell = { session_id: I.sess.id, class_id: I.A };
  const cells = [{ class_id: I.A, subject_id: I.sub, note: "교사 바뀜" }, { class_id: I.B, subject_id: I.sub }];
  const d = (await W(owner, "sessionSave", { term_id: I.term, id: I.sess.id, ver: I.sess.ver, on_date: "2026-09-05", start_t: "18:30", end_t: "21:30", mock: true, cells })).json;
  I.sess = d.sessions[0];
  eq((await W(tch, "weeklySheet", cell)).json.records.length, 2, "칸 내용을 고쳐도 입력된 성적 유지");
  await W(tch, "cellMockMax", { ...cell, mock_max: 60 });
  eq((await W(tch, "recordSave", { ...cell, student_id: I.가학생, field: "mock", value: 61 })).status, 400, "만점 초과");
  eq((await W(tch, "recordSave", { ...cell, student_id: I.가학생, field: "mock", value: 55.5 })).json.value, 55.5);
  eq((await W(owner, "sessionSave", { term_id: I.term, id: I.sess.id, ver: I.sess.ver, on_date: "2026-09-05", cells: [{ class_id: I.B, subject_id: I.sub }] })).status, 400, "성적 있는 반 칸 비우기 막음");
  eq((await W(owner, "sessionSave", { term_id: I.term, id: I.sess.id, ver: I.sess.ver, on_date: "2026-09-05", kind: "holiday" })).status, 400, "휴강으로 바꾸기 막음");
  eq((await W(owner, "sessionDelete", { term_id: I.term, id: I.sess.id })).status, 400, "성적 있는 회차 삭제 막음");
  eq((await W(tch, "weeklySheet", cell)).json.info.mock_max, 60);
}});

Deno.test({ name: "평가 규칙: 기본값, 관리 권한만 저장", ...opts, fn: async () => {
  eq((await W(tch, "rulesGet", { course_id: I.course })).json.rules.weights.mock, 50);
  const body = { course_id: I.course, weights: { att: 5, book: 5, beh: 5, act: 5, hw: 10, test: 30, mock: 40 }, hw_scale: { A: 100, B: 70, C: 30, D: 0 }, note_penalty: 2, alert: { drop: 15, gap: 20, rep: 2, days: 7 } };
  eq((await W(tch, "rulesSave", body)).status, 403);
  eq((await W(owner, "rulesSave", body)).json.rules.weights.test, 30);
  eq((await W(owner, "rulesSave", { ...body, weights: { ...body.weights, test: -1 } })).status, 400);
}});

Deno.test({ name: "정리", ...opts, fn: async () => { await jwks.shutdown(); } });
