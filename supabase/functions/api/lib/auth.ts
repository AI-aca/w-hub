// 구글 로그인 검증 + 세션
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Tx } from "./db.ts";
import { fail, newToken, sha256, str } from "./util.ts";
import { config } from "./config.ts";

const JWKS_URL = Deno.env.get("WHUB_GOOGLE_JWKS_URL") ?? "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = (Deno.env.get("WHUB_GOOGLE_ISSUER") ?? "accounts.google.com,https://accounts.google.com").split(",");
const jwks = createRemoteJWKSet(new URL(JWKS_URL));

export const clientId = async (): Promise<string> => (await config()).clientId;

export interface GoogleId { email: string; name: string }

/** 구글 ID 토큰을 서명·발급자·대상·만료까지 검증한다. */
export async function verifyGoogle(credential: string, aud: string): Promise<GoogleId> {
  if (!aud) fail("구글 로그인 설정(클라이언트 ID)이 없습니다.", 500, "config");
  let payload;
  try {
    ({ payload } = await jwtVerify(credential, jwks, { issuer: ISSUERS, audience: aud, clockTolerance: 30 }));
  } catch (_) {
    fail("구글 로그인 확인에 실패했습니다. 다시 시도해 주세요.", 401, "google_invalid");
  }
  const email = str(payload!.email, 200).toLowerCase();
  if (!email || payload!.email_verified !== true) fail("확인된 구글 이메일이 아닙니다.", 401, "google_invalid");
  return { email, name: str(payload!.name, 60) };
}

export const isBootOwner = async (email: string) => (await config()).owners.includes(email);

export async function sessionDays(tx: Tx): Promise<number> {
  const [r] = await tx`select value from core.settings where key = 'session_days'`;
  const n = Number(r?.value ?? 14);
  return Number.isFinite(n) && n >= 1 && n <= 60 ? n : 14;
}

export async function createSession(tx: Tx, email: string, ua: string): Promise<string> {
  const token = newToken();
  const days = await sessionDays(tx);
  await tx`delete from core.sessions where expires_at < now()`;
  await tx`insert into core.sessions (token_hash, email, expires_at, user_agent)
           values (${await sha256(token)}, ${email}, now() + make_interval(days => ${days}), ${str(ua, 200)})`;
  return token;
}

export interface Me { email: string; name: string; is_owner: boolean }

/** 세션 토큰으로 승인된 사용자를 찾는다. 없으면 401. */
export async function requireUser(tx: Tx, token: unknown): Promise<Me> {
  const t = str(token, 200);
  if (!t) fail("로그인이 필요합니다.", 401, "no_session");
  const [u] = await tx`select u.email, u.name, u.is_owner from core.sessions s join core.users u on u.email = s.email
                       where s.token_hash = ${await sha256(t)} and s.expires_at > now() and u.status = 'approved'`;
  if (!u) fail("로그인이 만료되었습니다. 다시 로그인해 주세요.", 401, "no_session");
  await tx`update core.sessions set last_seen = now() where token_hash = ${await sha256(t)} and last_seen < now() - interval '1 minute'`;
  return u as Me;
}

export function requireOwner(me: Me): void {
  if (!me.is_owner) fail("원장 계정만 할 수 있습니다.", 403, "forbidden");
}
