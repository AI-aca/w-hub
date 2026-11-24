// 로컬 시험 서버: 가짜 구글(:8099, /certs · /sign) + 서버 함수(:8000/api)
import { googleToken, serveJwks, TEST_CLIENT_ID, TEST_ISSUER } from "../server/fake_google.ts";

Deno.env.set("SUPABASE_DB_URL", Deno.env.get("SUPABASE_DB_URL") ?? "postgres://postgres@localhost:5433/postgres");
Deno.env.set("WHUB_GOOGLE_JWKS_URL", "http://localhost:8099/certs");
Deno.env.set("WHUB_GOOGLE_ISSUER", TEST_ISSUER);
Deno.env.set("WHUB_GOOGLE_CLIENT_ID", TEST_CLIENT_ID);
Deno.env.set("WHUB_OWNER_EMAILS", "owner@test.kr");
Deno.env.set("WHUB_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173");

const jwks = serveJwks(8098);
Deno.serve({ port: 8099, onListen: () => {} }, async (req) => {
  const u = new URL(req.url);
  const cors = { "Access-Control-Allow-Origin": "*" };
  if (u.pathname === "/certs") return await fetch("http://localhost:8098/certs");
  if (u.pathname === "/sign") {
    const t = await googleToken({ email: u.searchParams.get("email") ?? "", name: u.searchParams.get("name") ?? undefined });
    return new Response(t, { headers: cors });
  }
  return new Response("not found", { status: 404 });
});
void jwks;

const { handle } = await import("../../supabase/functions/api/handler.ts");
Deno.serve({ port: 8000, onListen: () => console.log("api :8000 ready") }, (req) => handle(req));
