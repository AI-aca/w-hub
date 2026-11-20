// 시험용 가짜 구글: JWKS 를 내주고, 구글 ID 토큰과 같은 형식의 토큰을 서명한다.
import { exportJWK, generateKeyPair, SignJWT } from "jose";

export const TEST_CLIENT_ID = "test-client.apps.googleusercontent.com";
export const TEST_ISSUER = "https://accounts.google.com";

const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
const jwk = { ...(await exportJWK(publicKey)), kid: "test-key", alg: "RS256", use: "sig" };
const other = await generateKeyPair("RS256", { extractable: true });

export function serveJwks(port: number): Deno.HttpServer {
  return Deno.serve({ port, onListen: () => {} }, () =>
    new Response(JSON.stringify({ keys: [jwk] }), { headers: { "content-type": "application/json" } }));
}

export interface TokenOpts { email: string; name?: string; aud?: string; verified?: boolean; expired?: boolean; wrongKey?: boolean }

export async function googleToken(o: TokenOpts): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({ email: o.email, email_verified: o.verified ?? true, name: o.name ?? o.email.split("@")[0] })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(TEST_ISSUER)
    .setAudience(o.aud ?? TEST_CLIENT_ID)
    .setSubject("sub-" + o.email)
    .setIssuedAt(o.expired ? now - 7200 : now)
    .setExpirationTime(o.expired ? now - 3600 : now + 3600)
    .sign(o.wrongKey ? other.privateKey : privateKey);
}
