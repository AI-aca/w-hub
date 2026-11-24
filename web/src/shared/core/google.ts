// 구글 로그인 버튼(Google Identity Services)
interface GisId {
  initialize(o: { client_id: string; callback: (r: { credential: string }) => void; auto_select?: boolean; ux_mode?: string }): void;
  renderButton(el: HTMLElement, o: Record<string, unknown>): void;
  disableAutoSelect(): void;
}
declare global { interface Window { google?: { accounts?: { id?: GisId } } } }

let loading: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  loading ??= new Promise((ok, bad) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => ok();
    s.onerror = () => { loading = null; bad(new Error("구글 로그인 도구를 불러오지 못했습니다.")); };
    document.head.appendChild(s);
  });
  return loading;
}

export async function renderGoogleButton(el: HTMLElement, clientId: string, onCredential: (c: string) => void): Promise<void> {
  await loadGis();
  const id = window.google!.accounts!.id!;
  id.initialize({ client_id: clientId, callback: (r) => onCredential(r.credential), auto_select: false });
  id.renderButton(el, { theme: "outline", size: "large", text: "signin_with", shape: "pill", width: 280, locale: "ko" });
}

export function googleSignOut(): void {
  try { window.google?.accounts?.id?.disableAutoSelect(); } catch { /* 무시 */ }
}
