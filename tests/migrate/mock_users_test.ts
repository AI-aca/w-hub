// 옮겨 오기 틀 시험: 모의고사 계정 작업 (로컬 Postgres :5433, db_reset 후)
import { deepStrictEqual, ok, rejects } from "node:assert";
import postgres from "postgres";
import { extract, load } from "../../tools/migrate/run.ts";
import { parseExtract, targetScript } from "../../tools/migrate/lib.ts";
import job from "../../tools/migrate/jobs/mock_users.ts";

const URL = "postgres://postgres@localhost:5433/postgres";
const sql = postgres(URL, { prepare: false, max: 1, onnotice: () => {} });

async function setup() {
  await sql.unsafe(`
    drop schema if exists mock cascade;
    create schema mock;
    create table mock.users (email text primary key, name text not null default '', role text not null, status text not null);
    insert into mock.users values
      ('owner@test.kr', '원장', 'admin', 'approved'),
      ('A@test.kr', '가선생', 'admin', 'approved'),
      ('b@test.kr', '나선생', 'member', 'approved'),
      ('c@test.kr', '다선생', 'member', 'pending');
    insert into core.settings (key, value) values ('owner_emails', '["owner@test.kr"]')
      on conflict (key) do update set value = excluded.value;`);
}
const users = async () => (await sql`select email, status from core.users order by email`).map((r) => `${r.email}:${r.status}`);
const mems = async () => (await sql`select email, role from core.memberships where area = 'scores_mock' order by email`).map((r) => `${r.email}:${r.role}`);
const runs = async () => Number((await sql`select count(*) from core.migration_runs where result = 'ok'`)[0].count);

Deno.test("모의고사 계정 옮겨 오기", async (t) => {
  await setup();
  const data = await extract(job, URL);

  await t.step("원본: 승인 계정만, 이메일 소문자, 대조값", () => {
    deepStrictEqual(data.check, { rows: 3, admins: 2 });
    deepStrictEqual(data.rows.map((r) => (r as { email: string }).email), ["a@test.kr", "b@test.kr", "owner@test.kr"]);
  });

  await t.step("시험 실행은 아무것도 바꾸지 않음", async () => {
    const before = await users();
    const r = await load(job, URL, data, { apply: false, runBy: "test" });
    deepStrictEqual(r.target_check, { rows: 3, admins: 2 });
    deepStrictEqual(await users(), before);
    deepStrictEqual(await runs(), 0);
  });

  await t.step("반영: 원장 제외, 관리자/입력 권한, 실행 기록", async () => {
    await load(job, URL, data, { apply: true, runBy: "test" });
    deepStrictEqual(await users(), ["a@test.kr:approved", "b@test.kr:approved"]);
    deepStrictEqual(await mems(), ["a@test.kr:admin", "b@test.kr:editor"]);
    deepStrictEqual(await runs(), 1);
  });

  await t.step("다시 돌려도 같은 결과, W-HUB 에서 바꾼 권한은 덮지 않음", async () => {
    await sql`update core.memberships set role = 'viewer' where email = 'b@test.kr'`;
    await load(job, URL, data, { apply: true, runBy: "test" });
    deepStrictEqual(await mems(), ["a@test.kr:admin", "b@test.kr:viewer"]);
    deepStrictEqual(await runs(), 2);
  });

  await t.step("대조가 어긋나면 전부 되돌림", async () => {
    await sql`delete from core.memberships where email = 'b@test.kr'`;
    const bad = { ...data, check: { rows: 3, admins: 1 } };
    await rejects(load(job, URL, bad, { apply: true, runBy: "test" }), /대조 불일치/);
    deepStrictEqual(await mems(), ["a@test.kr:admin"]);
    deepStrictEqual(await runs(), 2);
  });

  await t.step("SQL 편집기용 스크립트: 데이터 안의 $ 표시와 겹치지 않음", () => {
    const tricky = parseExtract({ rows: [{ email: "x@y", name: "$wh0$", role: "editor" }], check: { rows: 1, admins: 0 } });
    const s = targetScript(job, tricky, "h", { apply: false, runBy: "t" });
    ok(s.includes("$wh1$") && s.trim().endsWith("rollback;"));
  });

  await sql.unsafe("drop schema mock cascade; delete from core.migration_runs;");
  await sql.end();
});
