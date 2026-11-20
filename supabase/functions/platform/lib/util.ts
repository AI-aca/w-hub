// 공용 도구: 오류, 입력 정리, 해시, 토큰
export class Fail extends Error {
  constructor(message: string, public status = 400, public code = "bad_request") {
    super(message);
  }
}
export const fail = (msg: string, status = 400, code = "bad_request"): never => {
  throw new Fail(msg, status, code);
};

export function str(v: unknown, max: number): string {
  if (v == null) return "";
  // deno-lint-ignore no-control-regex
  return String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);
}

export function email(v: unknown): string {
  const e = str(v, 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) fail("이메일 형식이 올바르지 않습니다.");
  return e;
}

export async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function newToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

