// w-hub 서버 함수(게이트웨이). 모든 요청은 POST { action, token?, ... }.
// 설정(허용 출처·원장 이메일·구글 클라이언트 ID)은 core.settings 에 둔다. 프로젝트 Secrets 는 쓰지 않는다(SUPABASE_DB_URL 자동 값만).
import { coreActions } from "./actions/core.ts";
import { adminActions } from "./actions/admin.ts";
import { Fail } from "./lib/util.ts";
import { config } from "./lib/config.ts";

export interface Ctx { ip: string; ua: string }
type Handler = (b: Record<string, unknown>, c: Ctx) => Promise<unknown>;

const ACTIONS: Record<string, Handler> = {
  ...coreActions,
  ...adminActions,
};

function cors(origin: string | null, ORIGINS: string[]): Record<string, string> {
  const ok = origin && ORIGINS.includes(origin) ? origin : ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": ok,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export async function handle(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");
  let ORIGINS: string[];
  try { ORIGINS = (await config()).origins; } catch (e) {
    console.error("config", e);
    return new Response(JSON.stringify({ ok: false, error: "서버 설정을 읽지 못했습니다." }), { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } });
  }
  const headers = { ...cors(origin, ORIGINS), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ ok: false, error: "POST만 받습니다." }), { status: 405, headers });
  if (origin && !ORIGINS.includes(origin)) {
    return new Response(JSON.stringify({ ok: false, error: "허용되지 않은 출처입니다." }), { status: 403, headers });
  }

  let body: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > 1_000_000) throw new Error("too big");
    body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("not object");
  } catch (_) {
    return new Response(JSON.stringify({ ok: false, error: "요청 형식이 올바르지 않습니다." }), { status: 400, headers });
  }

  const fn = ACTIONS[String(body.action ?? "")];
  if (!fn || !Object.hasOwn(ACTIONS, String(body.action))) {
    return new Response(JSON.stringify({ ok: false, error: "알 수 없는 요청입니다." }), { status: 400, headers });
  }
  const ctx: Ctx = {
    ip: (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown",
    ua: req.headers.get("user-agent") ?? "",
  };
  try {
    const out = await fn(body, ctx);
    return new Response(JSON.stringify(out), { status: 200, headers });
  } catch (e) {
    if (e instanceof Fail) {
      return new Response(JSON.stringify({ ok: false, error: e.message, code: e.code }), { status: e.status, headers });
    }
    console.error(body.action, e);
    return new Response(JSON.stringify({ ok: false, error: "서버 오류가 발생했습니다. 잠시 뒤 다시 시도해 주세요.", code: "server" }), { status: 500, headers });
  }
}


