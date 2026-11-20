// 서버 함수 통합 시험 (로컬 Postgres :5433 필요 — tests/local/db_up.sh)
import { deepStrictEqual, ok } from "node:assert";
const assertEquals = (a: unknown, b: unknown, m?: string) => deepStrictEqual(a, b, m);
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
const { handle } = await import("../../supabase/functions/platform/handler.ts");

const ORIGIN = "https://ai-aca.github.io";
async function call(body: Record<string, unknown>, opt: { ip?: string; origin?: string; method?: string } = {}) {
  const res = await handle(new Request("http://x/platform", {
    method: opt.method ?? "POST",
    headers: { origin: opt.origin ?? ORIGIN, "x-forwarded-for": opt.ip ?? "1.1.1.1", "content-type": "application/json" },
    body: opt.method === "OPTIONS" ? undefined : JSON.stringify(body),
  }));
  const text = await res.text();
  return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null };
}
async function login(email: string, name?: string, ip?: string) {
  return await call({ action: "login", credential: await googleToken({ email, name }) }, { ip });
}

const opts = { sanitizeOps: false, sanitizeResources: false };
let ownerToken = "";
let staffToken = "";
let songdoId = 0;
let sejongId = 0;

Deno.test({ name: "설정: 클라이언트 ID 공개", ...opts, fn: async () => {
  const r = await call({ action: "config" });
  assertEquals(r.json.google_client_id, TEST_CLIENT_ID);
}});

Deno.test({ name: "구글 토큰 위조·만료·대상 불일치·미인증 메일은 거부", ...opts, fn: async () => {
  for (const o of [
    { email: "x@test.kr", wrongKey: true },
    { email: "x@test.kr", expired: true },
    { email: "x@test.kr", aud: "other-client" },
    { email: "x@test.kr", verified: false },
  ]) {
    const r = await call({ action: "login", credential: await googleToken(o) }, { ip: "9.9.9.1" });
    assertEquals(r.status, 401, JSON.stringify(o));
    assertEquals(r.json.ok, false);
  }
  const r = await call({ action: "login", credential: "not-a-jwt" }, { ip: "9.9.9.1" });
  assertEquals(r.status, 401);
}});

Deno.test({ name: "처음 보는 계정은 승인 대기", ...opts, fn: async () => {
  let r = await login("staff@test.kr", "송도실장");
  assertEquals(r.json.state, "pending");
  r = await login("staff@test.kr", "송도실장");
  assertEquals(r.json.state, "pending");
  assertEquals((await call({ action: "me" })).status, 401);
}});

Deno.test({ name: "원장 계정 로그인: 두 작업공간·전 모듈", ...opts, fn: async () => {
  const r = await login("owner@test.kr", "원장");
  assertEquals(r.json.ok, true);
  ownerToken = r.json.token;
  const me = await call({ action: "me", token: ownerToken });
  assertEquals(me.json.user.is_owner, true);
  assertEquals(me.json.workspaces.map((w: { id: string }) => w.id), ["weiz", "yonsei"]);
  assertEquals(me.json.modules.length, 7);
  assertEquals(me.json.access.yonsei.naesin.role, "owner");
  songdoId = me.json.centers.find((c: { name: string }) => c.name === "송도").id;
  sejongId = me.json.centers.find((c: { workspace_id: string }) => c.workspace_id === "yonsei").id;
}});

Deno.test({ name: "원장 승인: 작업공간·모듈·센터 권한 저장과 검증", ...opts, fn: async () => {
  // 다른 작업공간 센터를 넣으면 거부
  let r = await call({ action: "userSave", token: ownerToken, email: "staff@test.kr", name: "송도실장", status: "approved",
    memberships: [{ workspace_id: "weiz", module_key: "naesin", role: "admin", center_ids: [sejongId] }] });
  assertEquals(r.status, 400);
  // 없는 모듈 거부
  r = await call({ action: "userSave", token: ownerToken, email: "staff@test.kr", status: "approved",
    memberships: [{ workspace_id: "yonsei", module_key: "weekend", role: "admin" }] });
  assertEquals(r.status, 400);
  // 정상: 와이즈만 내신(송도, 관리자) + 모의고사(입력자, 센터 넣어도 무시)
  r = await call({ action: "userSave", token: ownerToken, email: "staff@test.kr", name: "송도실장", status: "approved",
    memberships: [
      { workspace_id: "weiz", module_key: "naesin", role: "admin", center_ids: [songdoId] },
      { workspace_id: "weiz", module_key: "mock", role: "editor", center_ids: [songdoId] },
    ] });
  assertEquals(r.json.ok, true, JSON.stringify(r.json));

  const l = await login("staff@test.kr");
  assertEquals(l.json.ok, true);
  staffToken = l.json.token;
  const me = await call({ action: "me", token: staffToken });
  assertEquals(me.json.user.is_owner, false);
  assertEquals(me.json.workspaces.map((w: { id: string }) => w.id), ["weiz"]);
  assertEquals(me.json.modules.map((m: { module_key: string }) => m.module_key).sort(), ["mock", "naesin"]);
  assertEquals(me.json.access.weiz.naesin.center_ids, [songdoId]);
  assertEquals(me.json.access.weiz.mock.center_ids, null);
  assert(!me.json.centers.some((c: { workspace_id: string }) => c.workspace_id === "yonsei"));
}});

Deno.test({ name: "원장 전용 작업은 직원이 못 함", ...opts, fn: async () => {
  for (const action of ["userList", "userSave", "userDelete", "logList", "centerSave"]) {
    const r = await call({ action, token: staffToken, email: "owner@test.kr", workspace_id: "weiz", name: "x" });
    assertEquals(r.status, 403, action);
  }
}});

Deno.test({ name: "원장 자기 보호 · 마지막 원장 보호", ...opts, fn: async () => {
  let r = await call({ action: "userSave", token: ownerToken, email: "owner@test.kr", status: "approved", is_owner: false });
  assertEquals(r.status, 400);
  r = await call({ action: "userDelete", token: ownerToken, email: "owner@test.kr" });
  assertEquals(r.status, 400);
}});

Deno.test({ name: "센터 추가·중복 거부", ...opts, fn: async () => {
  let r = await call({ action: "centerSave", token: ownerToken, workspace_id: "yonsei", name: "연세 2센터", sort: 2 });
  assertEquals(r.json.ok, true);
  r = await call({ action: "centerSave", token: ownerToken, workspace_id: "yonsei", name: "연세 2센터" });
  assertEquals(r.status, 400);
  r = await call({ action: "centerSave", token: ownerToken, workspace_id: "nope", name: "x" });
  assertEquals(r.status, 400);
}});

Deno.test({ name: "차단하면 세션이 끊기고 다시 로그인 불가", ...opts, fn: async () => {
  const r = await call({ action: "userSave", token: ownerToken, email: "staff@test.kr", name: "송도실장", status: "blocked", memberships: [] });
  assertEquals(r.json.ok, true);
  assertEquals((await call({ action: "me", token: staffToken })).status, 401);
  assertEquals((await login("staff@test.kr")).json.state, "blocked");
}});

Deno.test({ name: "로그 기록", ...opts, fn: async () => {
  const r = await call({ action: "logList", token: ownerToken });
  const acts = r.json.rows.map((x: { action: string }) => x.action);
  for (const a of ["승인 요청", "로그인", "사용자 변경", "센터 변경"]) assert(acts.includes(a), a);
  const f = await call({ action: "logList", token: ownerToken, q: "송도실장" });
  const g = await call({ action: "logList", token: ownerToken, filter_action: "센터 변경" });
  assert(g.json.rows.length === 1 && g.json.rows[0].action === "센터 변경");
  assert(f.json.rows.length > 0);
}});

Deno.test({ name: "로그아웃하면 토큰 무효", ...opts, fn: async () => {
  const l = await login("owner@test.kr");
  const t = l.json.token;
  await call({ action: "logout", token: t });
  assertEquals((await call({ action: "me", token: t })).status, 401);
}});

Deno.test({ name: "요청 형식·출처 검사", ...opts, fn: async () => {
  assertEquals((await call({ action: "nope" })).status, 400);
  assertEquals((await call({ action: "constructor" })).status, 400);
  assertEquals((await call({ action: "__proto__" })).status, 400);
  assertEquals((await call({ action: "config" }, { origin: "https://evil.example" })).status, 403);
  const o = await call({}, { method: "OPTIONS", origin: "http://localhost:5173" });
  assertEquals(o.status, 204);
  assertEquals(o.headers.get("access-control-allow-origin"), "http://localhost:5173");
}});

Deno.test({ name: "같은 IP 로그인 실패 20회 넘으면 잠시 차단", ...opts, fn: async () => {
  for (let i = 0; i < 20; i++) await call({ action: "login", credential: "bad" }, { ip: "7.7.7.7" });
  const r = await call({ action: "login", credential: await googleToken({ email: "owner@test.kr" }) }, { ip: "7.7.7.7" });
  assertEquals(r.status, 429);
  const ok = await call({ action: "login", credential: await googleToken({ email: "owner@test.kr" }) }, { ip: "7.7.7.8" });
  assertEquals(ok.json.ok, true);
}});

Deno.test({ name: "정리", ...opts, fn: async () => { await jwks.shutdown(); } });
