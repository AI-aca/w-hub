// DB 접속: 트랜잭션마다 core_app 으로 권한을 낮춘다.
import postgres from "postgres";

const DB_URL = Deno.env.get("SUPABASE_DB_URL") ?? "";
if (!DB_URL) console.error("SUPABASE_DB_URL 이 없습니다.");

const client = postgres(DB_URL, {
  prepare: false,
  max: 3,
  idle_timeout: 20,
  connect_timeout: 15,
  onnotice: () => {},
});

export type Tx = postgres.TransactionSql;

export function db<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return client.begin(async (tx) => {
    await tx`set local role core_app`;
    return await fn(tx);
  }) as Promise<T>;
}
