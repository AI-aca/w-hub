// 가짜 구글 로그인 도구: 버튼을 누르면 window.__email 계정으로 서명된 토큰을 콜백에 넘긴다.
import type { Page } from "@playwright/test";

const FAKE_GIS = `
window.google = { accounts: { id: {
  initialize(o) { window.__gisCb = o.callback; },
  renderButton(el) {
    const b = document.createElement('button');
    b.textContent = 'Google 계정으로 로그인'; b.className = 'fake-gis';
    b.onclick = async () => {
      const t = await fetch('http://localhost:8099/sign?email=' + encodeURIComponent(window.__email) + '&name=' + encodeURIComponent(window.__name || ''))
        .then(r => r.text());
      window.__gisCb({ credential: t });
    };
    el.appendChild(b);
  },
  disableAutoSelect() {},
} } };`;

export async function prepare(page: Page): Promise<void> {
  await page.route("https://accounts.google.com/gsi/client", (r) => r.fulfill({ contentType: "text/javascript", body: FAKE_GIS }));
  await page.route("https://cdn.jsdelivr.net/**", (r) => r.fulfill({ contentType: "text/css", body: "" }));
}

export async function loginAs(page: Page, email: string, name = ""): Promise<void> {
  await page.evaluate(([e, n]) => { (window as any).__email = e; (window as any).__name = n; }, [email, name]);
  await page.getByRole("button", { name: "Google 계정으로 로그인" }).click();
}
