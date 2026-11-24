// 서버 함수 호출. 토큰은 이 브라우저에만 보관한다.
import { currentWs } from "./ws";
const API_URL = import.meta.env.VITE_API_URL;
const PUB_KEY = import.meta.env.VITE_SUPABASE_KEY ?? "";
const TOKEN_KEY = "whub_token";

export class ApiError extends Error {
  constructor(message: string, public code: string, public status: number) { super(message); }
}

export const token = {
  get(): string { try { return localStorage.getItem(TOKEN_KEY) ?? ""; } catch { return ""; } },
  set(t: string): void { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* 저장 불가 브라우저 */ } },
  clear(): void { try { localStorage.removeItem(TOKEN_KEY); } catch { /* 무시 */ } },
};

type Handler = () => void;
let onExpired: Handler = () => {};
export const setExpiredHandler = (h: Handler) => { onExpired = h; };

export async function api<T = Record<string, unknown>>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (PUB_KEY) { headers.apikey = PUB_KEY; headers.Authorization = "Bearer " + PUB_KEY; }
  let res: Response;
  try {
    res = await fetch(API_URL, { method: "POST", headers, body: JSON.stringify({ ...body, action, token: token.get(), ...(currentWs() && !("ws" in body) ? { ws: currentWs() } : {}) }) });
  } catch {
    throw new ApiError("서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.", "network", 0);
  }
  let data: Record<string, unknown> = {};
  try { data = await res.json(); } catch { /* 빈 응답 */ }
  if (!res.ok || data.ok === false && data.error) {
    const err = new ApiError(String(data.error ?? `요청에 실패했습니다 (${res.status})`), String(data.code ?? ""), res.status);
    if (res.status === 401 && err.code === "no_session" && action !== "me") onExpired();
    throw err;
  }
  return data as T;
}
