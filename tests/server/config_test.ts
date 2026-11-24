// 설정을 환경 변수 없이 core.settings 에서 읽는지 확인
import { deepStrictEqual } from "node:assert";
Deno.env.set("SUPABASE_DB_URL", "postgres://postgres@localhost:5433/postgres");
const { db } = await import("../../supabase/functions/api/lib/db.ts");
const { config } = await import("../../supabase/functions/api/lib/config.ts");

Deno.test({ name: "설정은 core.settings 에서 읽는다", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  await db((tx) => tx`insert into core.settings (key, value) values ('owner_emails', ${tx.json(["Owner@Test.kr", "b@test.kr"])}) on conflict (key) do update set value = excluded.value`);
  await db((tx) => tx`insert into core.settings (key, value) values ('google_client_id', ${tx.json("cid.apps.googleusercontent.com")}) on conflict (key) do update set value = excluded.value`);
  const c = await config();
  deepStrictEqual(c.owners, ["owner@test.kr", "b@test.kr"]);
  deepStrictEqual(c.origins, ["https://ai-aca.github.io"]);
  deepStrictEqual(c.clientId, "cid.apps.googleusercontent.com");
}});
