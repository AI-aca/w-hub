import { expect, test, type Page } from "@playwright/test";
import { loginAs, prepare } from "./fixtures";

test.describe.configure({ mode: "serial" });
const shots = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png` }); };
const menu = (page: Page) => page.getByRole("navigation", { name: "메뉴" });

test("처음 로그인한 선생님은 승인 대기", async ({ page }) => {
  await prepare(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
  await shot(page, "01_로그인");
  await loginAs(page, "kim@test.kr", "김선생");
  await expect(page.getByRole("heading", { name: "승인 대기 중" })).toBeVisible();
});

test("원장: 홈 · 작업공간 전환", async ({ page }) => {
  await prepare(page);
  await page.goto("/");
  await loginAs(page, "owner@test.kr", "원장");
  await expect(page.locator(".ws-switch")).toBeVisible();
  await expect(menu(page)).toContainText("학생");
  await expect(menu(page)).toContainText("관리");
  await expect(page.locator(".kpi", { hasText: "승인 대기 계정" })).toContainText("1개");
  await shot(page, "02_원장_홈");
  await page.locator(".ws-switch").getByRole("tab", { name: "연세국제" }).click();
  await expect(page).toHaveURL(/#\/yonsei\/home$/);
  await expect(page.locator(".main")).toContainText("문제은행");
  await expect(page.locator(".main")).not.toContainText("주말반");
  await shot(page, "03_원장_연세국제_홈");
  await page.reload();
  await expect(page.locator(".ws-switch .on")).toHaveText("연세국제");
});

test("원장: 한 선생님에게 학생(송도)·내신·주말반 권한", async ({ page }) => {
  await prepare(page);
  await page.goto("/#/weiz/admin/users");
  await loginAs(page, "owner@test.kr");
  await page.goto("/#/weiz/admin/users");
  await page.getByRole("row", { name: /kim@test.kr/ }).click();
  const d = page.getByRole("dialog", { name: "계정 편집" });
  const weiz = d.locator('.perm-ws[data-ws="weiz"]');
  const stu = weiz.locator('.perm-row[data-area="students"]');
  await stu.getByRole("button", { name: "입력" }).click();
  await stu.getByRole("button", { name: "송도" }).click();
  await weiz.locator('.perm-row[data-area="scores_naesin"]').getByRole("button", { name: "입력" }).click();
  await weiz.locator('.perm-row[data-area="scores_weekly"]').getByRole("button", { name: "입력" }).click();
  await shot(page, "04_권한_편집");
  await d.getByRole("button", { name: "저장" }).click();
  await expect(d).toBeHidden();
  await expect(page.getByRole("row", { name: /kim@test.kr/ })).toContainText("승인");
  await shot(page, "05_계정_목록");
});

test("선생님: 와이즈만만 보이고, 담당 센터 학생만 등록", async ({ page }) => {
  await prepare(page);
  await page.goto("/");
  await loginAs(page, "kim@test.kr");
  await expect(page.locator(".ws-switch")).toHaveCount(0);
  await expect(menu(page)).toContainText("학생");
  await expect(menu(page)).not.toContainText("관리");
  await expect(page.locator(".main")).toContainText("성적·내신");
  await shot(page, "06_선생님_홈");
  await menu(page).getByRole("link", { name: "학생" }).click();
  await page.getByRole("link", { name: "+ 학생 등록" }).click();
  const centers = await page.locator('select[name="center_id"] option').allTextContents();
  expect(centers).toEqual(["송도"]);
  await page.locator('input[name="name"]').fill("홍길동");
  await page.locator('input[name="school_name"]').fill("송도고");
  await page.locator('input[name="entry_year"]').fill("2026");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page.getByRole("heading", { name: "홍길동" })).toBeVisible();
  await page.locator('textarea[name="memo"]').fill("물리 강함");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page.locator(".toast.ok")).toBeVisible();
  await page.getByRole("tab", { name: "변경 기록" }).click();
  await expect(page.locator(".tl")).toContainText("메모");
  await shot(page, "07_학생_변경기록");
  await page.getByRole("tab", { name: "기본 정보" }).click();
  await expect(page.locator('textarea[name="memo"]')).toHaveValue("물리 강함");
  await page.locator(".toast").first().waitFor({ state: "detached" });
  await shot(page, "08_학생_기본정보");
});

test("원장: 연세국제 학생 명단은 따로", async ({ page }) => {
  await prepare(page);
  await page.goto("/");
  await loginAs(page, "owner@test.kr");
  await page.goto("/#/weiz/students");
  await expect(page.getByLabel("학생 명단")).toContainText("홍길동");
  await shot(page, "09_와이즈만_학생목록");
  await page.goto("/#/yonsei/students");
  await expect(page.getByLabel("학생 명단")).toContainText("학생 0명");
  await shot(page, "10_연세국제_학생목록");
});
