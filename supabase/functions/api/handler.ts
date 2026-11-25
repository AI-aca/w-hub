// W-HUB 서버 함수 api. 모든 요청은 POST { action, token?, ws?, ... }.
// 액션은 areas/*/actions.ts 에서 defineAction 으로만 만든다(권한 선언 필수).
import core from "./areas/core/actions.ts";
import admin from "./areas/admin/actions.ts";
import students from "./areas/students/actions.ts";
import classSetup from "./areas/class/setup.ts";
import classTimetable from "./areas/class/timetable.ts";
import classPlan from "./areas/class/plan.ts";
import classRoster from "./areas/class/roster.ts";
import weekly from "./areas/weekly/actions.ts";
import weeklyDash from "./areas/weekly/dashboard.ts";
import weeklyFocus from "./areas/weekly/focus.ts";
import { type Action, type Ctx, runAction } from "./lib/registry.ts";
import { Fail } from "./lib/util.ts";
import { config } from "./lib/config.ts";

const ACTIONS = new Map<string, Action>();
for (const a of [...core, ...admin, ...students, ...classSetup, ...classTimetable, ...classPlan, ...classRoster, ...weekly, ...weeklyDash, ...weeklyFocus]) {
  if (ACTIONS.has(a.name)) throw new Error(`액션 이름 중복: ${a.name}`);
  ACTIONS.set(a.name, a);
}
export const actionNames = () => [...ACTIONS.keys()];

function cors(origin: string | null, origins: string[]): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin && origins.includes(origin) ? origin : origins[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export async function handle(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");
  let origins: string[];
  try { origins = (await config()).origins; } catch (e) {
    console.error("config", e);
    return new Response(JSON.stringify({ ok: false, error: "서버 설정을 읽지 못했습니다." }), { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } });
  }
  const headers = { ...cors(origin, origins), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  const out = (status: number, b: unknown) => new Response(JSON.stringify(b), { status, headers });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return out(405, { ok: false, error: "POST만 받습니다." });
  if (origin && !origins.includes(origin)) return out(403, { ok: false, error: "허용되지 않은 출처입니다." });

  let body: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > 1_000_000) throw new Error("too big");
    body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("not object");
  } catch (_) {
    return out(400, { ok: false, error: "요청 형식이 올바르지 않습니다." });
  }
  const a = ACTIONS.get(String(body.action ?? ""));
  if (!a) return out(400, { ok: false, error: "알 수 없는 요청입니다." });
  const ctx: Ctx = {
    ip: (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown",
    ua: req.headers.get("user-agent") ?? "",
  };
  try {
    return out(200, await runAction(a, body, ctx));
  } catch (e) {
    if (e instanceof Fail) return out(e.status, { ok: false, error: e.message, code: e.code });
    console.error(body.action, e);
    return out(500, { ok: false, error: "서버 오류가 발생했습니다. 잠시 뒤 다시 시도해 주세요.", code: "server" });
  }
}
