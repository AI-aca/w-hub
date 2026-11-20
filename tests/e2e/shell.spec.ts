import { expect, test } from "@playwright/test";
import { loginAs, prepare } from "./fixtures";

test.describe.configure({ mode: "serial" });
const shots = process.env.SHOTS_DIR;

test("처음 로그인한 직원은 승인 대기", async ({ page }) => {
  await prepare(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/01_로그인.png` });
  await loginAs(page, "yonsei.staff@test.kr", "연세실장");
  await expect(page.getByRole("heading", { name: "승인 대기 중" })).toBeVisible();
  await expect(page.getByText("yonsei.staff@test.kr")).toBeVisible();
});

test("원장: 작업공간 전환·모듈 메뉴·승인 대기 알림", async ({ page }) => {
  await prepare(page);
  await page.goto("/");
  await loginAs(page, "owner@test.kr", "원장");
  await expect(page.locator(".ws-switch")).toBeVisible();
  await expect(page.locator(".mods")).toContainText("주말반");
  await expect(page.locator(".mods")).toContainText("생기부 진단");
  await expect(page.locator(".notice")).toContainText("승인 대기 계정 1개");
  if (shots) await page.screenshot({ path: `${shots}/02_원장_와이즈만_홈.png` });
  await page.locator(".ws-switch").getByRole("tab", { name: "연세국제" }).click();
  await expect(page).toHaveURL(/#\/w\/yonsei$/);
  await expect(page.locator(".mods")).toContainText("온라인 진단");
  await expect(page.locator(".mods")).not.toContainText("주말반");
  if (shots) await page.screenshot({ path: `${shots}/03_원장_연세국제_홈.png` });
  // 새로고침해도 로그인·작업공간 유지
  await page.reload();
  await expect(page.locator(".ws-switch .on")).toHaveText("연세국제");
});

test("원장: 직원 승인 — 연세국제 내신(세종·관리자) + 온라인 진단(입력자)", async ({ page }) => {
  await prepare(page);
  await page.goto("/");
  await loginAs(page, "owner@test.kr");
  await page.locator(".mod.admin").click();
  await expect(page.getByRole("heading", { name: "계정·권한" })).toBeVisible();
  await page.getByRole("row", { name: /yonsei.staff@test.kr/ }).click();
  const d = page.getByRole("dialog", { name: "계정 편집" });
  await d.locator("select").selectOption("approved");
  const ys = d.locator(".perm-ws", { hasText: "연세국제" });
  await ys.locator(".perm-row", { hasText: "온라인 진단" }).getByRole("button", { name: "입력자" }).click();
  const nr = ys.locator(".perm-row", { hasText: "내신" });
  await nr.getByRole("button", { name: "관리자" }).click();
  await nr.getByText("전체 센터").click();
  // 센터를 하나도 안 고르면 저장 거부
  await d.getByRole("button", { name: "저장" }).click();
  await expect(page.locator(".toast.err")).toContainText("센터를 하나 이상");
  await nr.getByText("세종(연세국제영어)").click();
  if (shots) await page.screenshot({ path: `${shots}/04_계정편집.png` });
  await d.getByRole("button", { name: "저장" }).click();
  await expect(page.locator(".toast.ok")).toContainText("저장했습니다");
  const row = page.getByRole("row", { name: /yonsei.staff@test.kr/ });
  await expect(row).toContainText("승인");
  await expect(row).toContainText("연세국제 내신 · 관리자 · 세종(연세국제영어)");
  if (shots) await page.screenshot({ path: `${shots}/05_계정목록.png` });
  // 로그에 남았는지
  await page.getByRole("link", { name: "로그" }).click();
  await expect(page.locator("table")).toContainText("사용자 변경");
  if (shots) await page.screenshot({ path: `${shots}/06_로그.png` });
});

test("연세국제 직원: 자기 작업공간만, 전환 버튼·관리 메뉴 없음", async ({ page }) => {
  await prepare(page);
  await page.goto("/");
  await loginAs(page, "yonsei.staff@test.kr");
  await expect(page.locator(".ws-name")).toHaveText("연세국제");
  await expect(page.locator(".ws-switch")).toHaveCount(0);
  await expect(page.locator(".mods")).toContainText("온라인 진단");
  await expect(page.locator(".mods")).toContainText("내신");
  await expect(page.locator(".mods")).not.toContainText("외고");
  await expect(page.locator(".mods")).not.toContainText("관리");
  await expect(page.locator(".card", { hasText: "내신" })).toContainText("세종(연세국제영어)");
  if (shots) await page.screenshot({ path: `${shots}/07_연세직원_홈.png` });
  // 권한 밖 주소로 가면 자기 홈으로
  await page.goto("/#/admin/users");
  await expect(page).toHaveURL(/#\/w\/yonsei$/);
  await page.goto("/#/w/weiz/mock");
  await expect(page).toHaveURL(/#\/w\/yonsei$/);
  // 로그아웃
  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
});

test("모듈 화면: 기존 사이트 링크 안내", async ({ page }) => {
  await prepare(page);
  await page.goto("/");
  await loginAs(page, "owner@test.kr");
  await page.locator(".ws-switch").getByRole("tab", { name: "와이즈만" }).click();
  await page.locator(".mods").getByRole("link", { name: "모의고사" }).click();
  await expect(page.getByRole("link", { name: /영재학교 모의고사 사이트 열기/ })).toHaveAttribute("href", "https://ai-aca.github.io/wmock/");
  if (shots) await page.screenshot({ path: `${shots}/08_모듈_자리.png` });
});

test("센터 관리: 추가", async ({ page }) => {
  await prepare(page);
  await page.goto("/");
  await loginAs(page, "owner@test.kr");
  await page.goto("/#/admin/centers");
  const p = page.locator(".panel", { hasText: "연세국제" });
  await p.locator("input[name=n]").fill("연세 2센터");
  await p.getByRole("button", { name: "추가" }).click();
  await expect(page.locator(".toast.ok")).toContainText("센터를 저장");
  await expect(p.locator(".center-list li")).toHaveCount(2);
  if (shots) await page.screenshot({ path: `${shots}/09_센터.png` });
});
