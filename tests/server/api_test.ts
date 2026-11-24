// 서버 함수 api 통합 시험 (로컬 Postgres :5433 필요 — tests/local/db_up.sh)
import { deepStrictEqual, ok } from "node:assert";
const eq = (a: unknown, b: unknown, m?: string) => deepStrictEqual(a, b, m);
const assert = (v: unknown, m?: string) => ok(v, m);
import { googleToken, serveJwks, TEST_CLIENT_ID, TEST_ISSUER } from "./fake_google.ts";

const JWKS_PORT = 8097;
Deno.env.set("SUPABASE_DB_URL", "postgres://postgres@localhost:5433/postgres");
Deno.env.set("WHUB_GOOGLE_JWKS_URL", `http://localhost:${JWKS_PORT}/certs`);
Deno.env.set("WHUB_GOOGLE_ISSUER", TEST_ISSUER);
Deno.env.set("WHUB_GOOGLE_CLIENT_ID", TEST_CLIENT_ID);
Deno.env.set("WHUB_OWNER_EMAILS", "owner@test.kr");
Deno.env.set("WHUB_ALLOWED_ORIGINS", "https://ai-aca.github.io,http://localhost:5173");

const jwks = serveJwks(JWKS_PORT);
const { handle } = await import("../../supabase/functions/api/handler.ts");

const ORIGIN = "https://ai-aca.github.io";
async function call(body: Record<string, unknown>, opt: { ip?: string; origin?: string; method?: string } = {}) {
  const res = await handle(new Request("http://x/api", {
    method: opt.method ?? "POST",
    headers: { origin: opt.origin ?? ORIGIN, "x-forwarded-for": opt.ip ?? "1.1.1.1", "content-type": "application/json" },
    body: opt.method === "OPTIONS" ? undefined : JSON.stringify(body),
  }));
  const text = await res.text();
  return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null };
}
const login = async (email: string, name?: string, ip?: string) =>
  await call({ action: "login", credential: await googleToken({ email, name }) }, { ip });

const opts = { sanitizeOps: false, sanitizeResources: false };
let owner = "", teacher = "";
const C: Record<string, number> = {};
let studentId = "";

Deno.test({ name: "설정: 클라이언트 ID 공개", ...opts, fn: async () => {
  eq((await call({ action: "config" })).json.google_client_id, TEST_CLIENT_ID);
}});

Deno.test({ name: "구글 토큰 위조·만료·대상 불일치·미인증 메일 거부", ...opts, fn: async () => {
  for (const o of [
    { email: "x@test.kr", wrongKey: true }, { email: "x@test.kr", expired: true },
    { email: "x@test.kr", aud: "other-client" }, { email: "x@test.kr", verified: false },
  ]) eq((await call({ action: "login", credential: await googleToken(o) }, { ip: "9.9.9.1" })).status, 401, JSON.stringify(o));
  eq((await call({ action: "login", credential: "not-a-jwt" }, { ip: "9.9.9.1" })).status, 401);
}});

Deno.test({ name: "처음 보는 계정은 승인 대기, 원장은 바로 로그인", ...opts, fn: async () => {
  eq((await login("t1@test.kr", "김선생")).json.state, "pending");
  eq((await login("t1@test.kr")).json.state, "pending");
  const r = await login("owner@test.kr", "원장");
  assert(r.json.ok && r.json.token);
  owner = r.json.token;
  const me = (await call({ action: "me", token: owner })).json;
  eq(me.user.is_owner, true);
  eq(me.workspaces.map((w: { id: string }) => w.id), ["weiz", "yonsei"]);
  assert(me.areas.some((a: { workspace_id: string; area: string }) => a.workspace_id === "yonsei" && a.area === "bank"));
  assert(!me.areas.some((a: { workspace_id: string; area: string }) => a.workspace_id === "yonsei" && a.area === "class"), "연세에는 수업 없음");
  for (const c of me.centers) C[c.workspace_id + ":" + c.name] = c.id;
}});

Deno.test({ name: "한 선생님에게 여러 영역 권한(학생+내신+주말반) — 센터 범위", ...opts, fn: async () => {
  const r = await call({ action: "userSave", token: owner, email: "t1@test.kr", name: "김선생", status: "approved", memberships: [
    { workspace_id: "weiz", area: "students", role: "editor", center_ids: [C["weiz:송도"]] },
    { workspace_id: "weiz", area: "scores_naesin", role: "editor", center_ids: [C["weiz:송도"]] },
    { workspace_id: "weiz", area: "scores_weekly", role: "editor" },
  ] });
  eq(r.json.ok, true, JSON.stringify(r.json));
  const bad = await call({ action: "userSave", token: owner, email: "t1@test.kr", status: "approved", memberships: [
    { workspace_id: "weiz", area: "students", role: "editor", center_ids: [C["yonsei:세종"]] }] });
  eq(bad.status, 400, "다른 작업공간 센터는 거부");
  teacher = (await login("t1@test.kr")).json.token;
  const me = (await call({ action: "me", token: teacher })).json;
  eq(me.workspaces.map((w: { id: string }) => w.id), ["weiz"], "연세는 안 보임");
  eq(me.areas.map((a: { area: string }) => a.area).sort(), ["scores_naesin", "scores_weekly", "students"]);
}});

Deno.test({ name: "원장 전용 작업은 선생님이 못 함", ...opts, fn: async () => {
  for (const action of ["userList", "userSave", "logList", "orgList", "centerSave"]) {
    eq((await call({ action, token: teacher, ws: "weiz" })).status, 403, action);
  }
  eq((await call({ action: "userList" })).status, 401);
}});

Deno.test({ name: "명부: 학교·강사 저장, 강사는 등록된 계정만 연결", ...opts, fn: async () => {
  eq((await call({ action: "schoolSave", token: owner, ws: "weiz", name: "송도고", level: "고", center_id: C["weiz:송도"] })).json.ok, true);
  eq((await call({ action: "schoolSave", token: owner, ws: "weiz", name: "송도고", level: "고", center_id: C["weiz:송도"] })).status, 400);
  eq((await call({ action: "schoolSave", token: owner, ws: "weiz", name: "X", level: "대" })).status, 400);
  eq((await call({ action: "staffSave", token: owner, ws: "weiz", name: "김선생", email: "t1@test.kr", subjects: ["물리"] })).json.ok, true);
  eq((await call({ action: "staffSave", token: owner, ws: "weiz", name: "남선생", email: "nobody@test.kr" })).status, 400);
  const o = (await call({ action: "orgList", token: owner, ws: "weiz" })).json;
  eq(o.schools.length, 1);
  eq(o.staff[0].subjects, ["물리"]);
  eq((await call({ action: "centerSave", token: owner, ws: "weiz", name: "송도" })).status, 400, "센터 중복");
}});

Deno.test({ name: "학생: 담당 센터 안에서만 등록·조회, 작업공간 분리", ...opts, fn: async () => {
  let r = await call({ action: "studentSave", token: teacher, ws: "weiz", name: "홍길동", center_id: C["weiz:송도"], school_name: "송도고", entry_year: 2026 });
  eq(r.json.ok, true, JSON.stringify(r.json));
  studentId = r.json.id;
  r = await call({ action: "studentSave", token: teacher, ws: "weiz", name: "이몽룡", center_id: C["weiz:청라"] });
  eq(r.status, 403, "담당 센터 아님");
  r = await call({ action: "studentSave", token: owner, ws: "weiz", name: "이몽룡", center_id: C["weiz:청라"] });
  eq(r.json.ok, true);
  r = await call({ action: "studentSave", token: owner, ws: "weiz", name: "홍길동", center_id: C["weiz:송도"], school_name: "송도고" });
  eq(r.status, 400, "동명이인은 번호로 구분");
  r = await call({ action: "studentSave", token: owner, ws: "weiz", name: "홍길동", name_no: 2, center_id: C["weiz:송도"], school_name: "송도고" });
  eq(r.json.ok, true);
  r = await call({ action: "studentSave", token: owner, ws: "yonsei", name: "홍길동", center_id: C["weiz:송도"] });
  eq(r.status, 400, "연세 학생에 와이즈만 센터 불가");
  const list = (await call({ action: "studentList", token: teacher, ws: "weiz" })).json.rows;
  eq(list.map((s: { name: string }) => s.name).sort(), ["홍길동", "홍길동"]);
  eq((await call({ action: "studentList", token: owner, ws: "weiz" })).json.rows.length, 3);
  eq((await call({ action: "studentList", token: owner, ws: "yonsei" })).json.rows.length, 0);
  eq((await call({ action: "studentList", token: teacher, ws: "yonsei" })).status, 403);
}});

Deno.test({ name: "학생: 동시 수정 막기·변경 이력·보관은 관리 권한", ...opts, fn: async () => {
  const g = (await call({ action: "studentGet", token: teacher, ws: "weiz", id: studentId })).json.student;
  let r = await call({ action: "studentSave", token: teacher, ws: "weiz", ...g, school_name: "송도고", memo: "물리 강함" });
  eq(r.json.ok, true);
  r = await call({ action: "studentSave", token: owner, ws: "weiz", ...g, memo: "옛 화면에서 저장" });
  eq(r.status, 409, "옛 ver 로 저장하면 거부");
  const d = (await call({ action: "studentGet", token: owner, ws: "weiz", id: studentId })).json;
  eq(d.history[0].action, "학생 변경");
  eq(d.history[0].detail.changes["메모"], ["", "물리 강함"]);
  eq((await call({ action: "studentArchive", token: teacher, ws: "weiz", id: studentId })).status, 403);
  eq((await call({ action: "studentArchive", token: owner, ws: "weiz", id: studentId })).json.ok, true);
  eq((await call({ action: "studentList", token: owner, ws: "weiz" })).json.rows.length, 2);
}});

Deno.test({ name: "원장 자기 보호·차단하면 세션 끊김·로그아웃", ...opts, fn: async () => {
  eq((await call({ action: "userSave", token: owner, email: "owner@test.kr", status: "approved", is_owner: false })).status, 400);
  eq((await call({ action: "userDelete", token: owner, email: "owner@test.kr" })).status, 400);
  await call({ action: "userSave", token: owner, email: "t1@test.kr", status: "blocked", memberships: [] });
  eq((await call({ action: "me", token: teacher })).status, 401);
  eq((await login("t1@test.kr")).json.state, "blocked");
  const logs = (await call({ action: "logList", token: owner })).json;
  assert(logs.actions.includes("학생 등록") && logs.actions.includes("사용자 변경"));
  const t = (await login("owner@test.kr")).json.token;
  await call({ action: "logout", token: t });
  eq((await call({ action: "me", token: t })).status, 401);
}});

Deno.test({ name: "요청 형식·출처 검사", ...opts, fn: async () => {
  eq((await call({ action: "config" }, { origin: "https://evil.example" })).status, 403);
  eq((await call({ action: "nope" })).status, 400);
  eq((await call({ action: "hasOwnProperty" })).status, 400);
  eq((await call({}, { method: "OPTIONS" })).status, 204);
  eq((await call({ action: "config" }, { method: "PUT" })).status, 405);
}});

Deno.test({ name: "같은 IP 로그인 실패 20회 넘으면 잠시 차단", ...opts, fn: async () => {
  for (let i = 0; i < 20; i++) await call({ action: "login", credential: "bad" }, { ip: "7.7.7.7" });
  eq((await call({ action: "login", credential: "bad" }, { ip: "7.7.7.7" })).status, 429);
}});

Deno.test({ name: "정리", ...opts, fn: async () => { await jwks.shutdown(); } });
