// 사이트 설정: core.settings 에서 읽는다(프로젝트 Secrets 를 쓰지 않아 기존 함수와 완전히 분리).
// 시험 때만 WHUB_* 환경 변수로 덮어쓴다.
import { db } from "./db.ts";

export interface Config { origins: string[]; owners: string[]; clientId: string }

const list = (v: unknown): string[] =>
  (Array.isArray(v) ? v : String(v ?? "").split(",")).map((s) => String(s).trim()).filter(Boolean);
const envList = (name: string): string[] | null => {
  const v = Deno.env.get(name);
  return v == null ? null : list(v);
};

let cache: { at: number; cfg: Config } | null = null;

export async function config(): Promise<Config> {
  if (cache && Date.now() - cache.at < 60_000) return cache.cfg;
  const rows = await db((tx) => tx`select key, value from core.settings where key in ('allowed_origins', 'owner_emails', 'google_client_id')`);
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  const cfg: Config = {
    origins: envList("WHUB_ALLOWED_ORIGINS") ?? (list(get("allowed_origins")).length ? list(get("allowed_origins")) : ["https://ai-aca.github.io"]),
    owners: (envList("WHUB_OWNER_EMAILS") ?? list(get("owner_emails"))).map((e) => e.toLowerCase()),
    clientId: Deno.env.get("WHUB_GOOGLE_CLIENT_ID") ?? String(get("google_client_id") ?? ""),
  };
  cache = { at: Date.now(), cfg };
  return cfg;
}
