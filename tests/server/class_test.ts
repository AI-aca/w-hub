// 수업(주말반) 서버 시험 (로컬 Postgres :5433, db_reset 후)
import { deepStrictEqual, ok } from "node:assert";
const eq = (a: unknown, b: unknown, m?: string) => deepStrictEqual(a, b, m);
import { googleToken, serveJwks, TEST_CLIENT_ID, TEST_ISSUER } from "./fake_google.ts";

const JWKS_PORT = 8096;
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
  const res = await handle(new Request("http://x/api", {
    method: "POST", headers: { origin: "https://ai-aca.github.io", "content-type": "application/json" }, body: JSON.stringify(body),
  }));
  return { status: res.status, json: await res.json() };
}
const login = async (email: string) => (await call({ action: "login", credential: await googleToken({ email, name: email }) })).json.token as string;
const opts = { sanitizeOps: false, sanitizeResources: false };
let owner = "", ed = "", vw = "";
const W = (token: string, action: string, b: J = {}) => call({ action, token, ws: "weiz", ...b });
const ids: J = {};

Deno.test({ name: "수업: 설정(과정·학기·과목·반)은 관리 권한", ...opts, fn: async () => {
  owner = await login("owner@test.kr");
  await login("ed@test.kr"); await login("vw@test.kr");
  for (const [email, role] of [["ed@test.kr", "editor"], ["vw@test.kr", "viewer"]]) {
    eq((await call({ action: "userSave", token: owner, email, status: "approved", memberships: [{ workspace_id: "weiz", area: "class", role }] })).status, 200);
  }
  ed = await login("ed@test.kr"); vw = await login("vw@test.kr");
  eq((await W(owner, "classSetup", { kind: "course", name: "2028 영재학교반" })).status, 200);
  let m = (await W(owner, "classMeta")).json;
  ids.course = m.courses[0].id;
  await W(owner, "classSetup", { kind: "term", course_id: ids.course, name: "[1차] 26년 8~12월", starts_on: "2026-08-01", ends_on: "2026-12-31" });
  for (const [name, category] of [["대수", "수학"], ["기하", "수학"], ["물리", "과학"]]) await W(owner, "classSetup", { kind: "subject", course_id: ids.course, name, category });
  for (const name of ["P반", "Q반"]) await W(owner, "classSetup", { kind: "class", course_id: ids.course, name });
  m = (await W(owner, "classMeta")).json;
  ids.term = m.terms[0].id; ids.alg = m.subjects[0].id; ids.phy = m.subjects[2].id; ids.P = m.classes[0].id; ids.Q = m.classes[1].id;
  eq((await W(ed, "classSetup", { kind: "class", course_id: ids.course, name: "R반" })).status, 403, "입력 권한은 설정 못 함");
  eq((await W(owner, "classSetup", { kind: "class", course_id: ids.course, name: "P반" })).status, 400, "이름 중복");
  eq((await call({ action: "classMeta", token: owner, ws: "yonsei" })).status, 403, "연세에는 수업 영역 없음");
}});

Deno.test({ name: "수업: 시간표 요약 → 주차 일괄 생성 → 상세 수정·휴강", ...opts, fn: async () => {
  const cells = [{ class_id: ids.P, subject_id: ids.alg }, { class_id: ids.Q, subject_id: ids.phy }];
  eq((await W(vw, "slotSave", { term_id: ids.term, weekday: 6, start_t: "18:30", end_t: "21:30", cells })).status, 403, "열람은 못 고침");
  let d = (await W(ed, "slotSave", { term_id: ids.term, weekday: 6, start_t: "18:30", end_t: "21:30", cells })).json;
  d = (await W(ed, "slotSave", { term_id: ids.term, weekday: 0, start_t: "15:00", end_t: "18:00", cells })).json;
  eq(d.slots.map((s: J) => s.weekday), [6, 0], "토 다음 일");
  eq((await W(ed, "slotSave", { term_id: ids.term, weekday: 6, start_t: "25:00", cells })).status, 400, "시간 형식");
  eq((await W(ed, "sessionsFromSlots", { term_id: ids.term, week_label: "1주차", dates: { 6: "2026-08-22" } })).status, 400, "요일 날짜 모두 필요");
  eq((await W(ed, "sessionsFromSlots", { term_id: ids.term, week_label: "1주차", dates: { 6: "2026-08-23", 0: "2026-08-23" } })).status, 400, "요일 불일치");
  const r = (await W(ed, "sessionsFromSlots", { term_id: ids.term, week_label: "1주차", dates: { 6: "2026-08-22", 0: "2026-08-23" } })).json;
  eq(r.created, 2);
  eq(r.sessions.map((s: J) => [s.on_date, s.start_t, s.cells.length]), [["2026-08-22", "18:30", 2], ["2026-08-23", "15:00", 2]]);
  const s0 = r.sessions[0];
  const up = (await W(ed, "sessionSave", { term_id: ids.term, id: s0.id, ver: s0.ver, on_date: s0.on_date, start_t: "18:00", end_t: "21:00", week_label: "1주차", cells: [{ class_id: ids.P, subject_id: ids.phy }] })).json;
  eq(up.sessions[0].cells.length, 1);
  eq((await W(ed, "sessionSave", { term_id: ids.term, id: s0.id, ver: s0.ver, on_date: s0.on_date })).status, 409, "옛 ver 는 거절");
  const h = (await W(ed, "sessionSave", { term_id: ids.term, on_date: "2026-09-26", kind: "holiday", note: "추석 휴강", important: true, cells })).json;
  const hol = h.sessions.find((s: J) => s.kind === "holiday");
  eq([hol.note, hol.important, hol.cells.length], ["추석 휴강", true, 0]);
  eq((await W(ed, "sessionSave", { term_id: ids.term, on_date: "2026-09-27", cells: [{ class_id: 999999 }] })).status, 400, "다른 과정 반 거부");
  eq((await W(ed, "sessionDelete", { term_id: ids.term, id: hol.id })).json.sessions.length, 2);
}});

Deno.test({ name: "수업: 진도 주차·칸 저장(동시 수정 막기)·업무 일정", ...opts, fn: async () => {
  let d = (await W(ed, "weekSave", { term_id: ids.term, category: "수학" })).json;
  d = (await W(ed, "weekSave", { term_id: ids.term, category: "수학" })).json;
  eq(d.weeks.map((w: J) => w.label), ["1주차", "2주차"]);
  const wk = d.weeks[0].id;
  eq((await W(ed, "currSave", { week_id: wk, subject_id: ids.alg, class_id: ids.P, content: "S-Core 1", ver: 0 })).json.ver, 1);
  eq((await W(ed, "currSave", { week_id: wk, subject_id: ids.alg, class_id: ids.P, content: "덮어쓰기", ver: 0 })).status, 409);
  eq((await W(ed, "currSave", { week_id: wk, subject_id: ids.alg, class_id: ids.P, content: "S-Core 2", ver: 1, important: true })).json.ver, 2);
  d = (await W(vw, "classTerm", { term_id: ids.term })).json;
  eq(d.curriculum.map((c: J) => [c.content, c.important]), [["S-Core 2", true]]);
  d = (await W(ed, "weekSave", { term_id: ids.term, category: "수학", id: wk, remove: true })).json;
  eq([d.weeks.length, d.curriculum.length], [1, 0], "주차 지우면 진도도 지움");
  d = (await W(ed, "eventSave", { term_id: ids.term, on_date: "2026-07-21", title: "수학팀 대면회의" })).json;
  const ev = d.events[0];
  d = (await W(ed, "eventSave", { term_id: ids.term, id: ev.id, ver: ev.ver, on_date: ev.on_date, title: ev.title, status: "done" })).json;
  eq(d.events[0].status, "done");
  eq((await W(ed, "eventSave", { term_id: ids.term, id: ev.id, remove: true })).json.events.length, 0);
}});

Deno.test({ name: "수업: 수강생 추가·반 배정·총점 자동", ...opts, fn: async () => {
  await call({ action: "userSave", token: owner, email: "ed@test.kr", status: "approved", memberships: [
    { workspace_id: "weiz", area: "class", role: "editor" }, { workspace_id: "weiz", area: "students", role: "editor" }] });
  const st = (await W(ed, "studentSave", { name: "홍길동", school_name: "송도중" })).json;
  ok(st.id);
  eq((await W(ed, "rosterCandidates", { course_id: ids.course, q: "홍" })).json.rows.length, 1);
  let d = (await W(ed, "rosterAdd", { course_id: ids.course, student_ids: [st.id] })).json;
  eq(d.rows.length, 1);
  eq((await W(ed, "rosterCandidates", { course_id: ids.course, q: "홍" })).json.rows.length, 0, "이미 넣은 학생은 후보에서 빠짐");
  const r = d.rows[0];
  d = (await W(ed, "rosterSave", { course_id: ids.course, student_id: st.id, ver: r.ver, class_id: ids.Q, scores: { alg: 43.5, geo: 42, com: 43 } })).json;
  eq(d.scores.total, 128.5);
  eq((await W(ed, "rosterSave", { course_id: ids.course, student_id: st.id, ver: r.ver, class_id: ids.P })).status, 409);
  eq((await W(ed, "rosterSave", { course_id: ids.course, student_id: st.id, ver: d.ver, scores: { alg: -1 } })).status, 400);
  eq((await W(vw, "rosterList", { course_id: ids.course })).json.rows[0].class_id, ids.Q);
}});

Deno.test({ name: "수업: 과목·반 지우기 — 쓰인 곳이 있으면 숨기기", ...opts, fn: async () => {
  eq((await W(owner, "classSetup", { kind: "class", course_id: ids.course, id: ids.Q, remove: true })).json.result, "hidden");
  await W(owner, "classSetup", { kind: "class", course_id: ids.course, name: "Z반" });
  const z = (await W(owner, "classMeta")).json.classes.find((c: J) => c.name === "Z반");
  eq((await W(owner, "classSetup", { kind: "class", course_id: ids.course, id: z.id, remove: true })).json.result, "deleted");
  eq((await W(owner, "classSetup", { kind: "term", course_id: ids.course, id: ids.term, remove: true })).status, 400, "시간표 있는 학기는 못 지움");
}});

Deno.test({ name: "정리", ...opts, fn: async () => { await jwks.shutdown(); } });
