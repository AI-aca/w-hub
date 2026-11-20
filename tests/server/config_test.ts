// 설정을 환경 변수 없이 core.settings 에서 읽는지 확인
import { deepStrictEqual } from "node:assert";
Deno.env.set("SUPABASE_DB_URL", "postgres://postgres@localhost:5433/postgres");
const { db } = await import("../../supabase/functions/platform/lib/db.ts");
const { config } = await import("../../supabase/functions/platform/lib/config.ts");

Deno.test({ name: "설정은 core.settings 에서 읽는다", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  await db((tx) => tx`update core.settings set value = ${tx.json(["Owner@Test.kr", "b@test.kr"])} where key = 'owner_emails'`);
  await db((tx) => tx`update core.settings set value = ${tx.json("cid.apps.googleusercontent.com")} where key = 'google_client_id'`);
  const c = await config();
  deepStrictEqual(c.owners, ["owner@test.kr", "b@test.kr"]);
  deepStrictEqual(c.origins, ["https://ai-aca.github.io"]);
  deepStrictEqual(c.clientId, "cid.apps.googleusercontent.com");
}});
