import { expect, test, type Page } from "@playwright/test";
import { loginAs, prepare } from "./fixtures";

test.describe.configure({ mode: "serial" });
const shots = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png` }); };
const side = (page: Page) => page.getByLabel("수업 화면");
const dlg = (page: Page) => page.locator("dialog[open]");

async function owner(page: Page) {
  await prepare(page);
  await page.goto("/");
  await loginAs(page, "owner@test.kr", "원장");
  await page.getByRole("navigation", { name: "메뉴" }).getByRole("link", { name: "수업" }).click();
}
async function add(page: Page, card: string, fill: Record<string, string>, select?: string) {
  await page.locator(".card", { has: page.getByRole("heading", { name: card, exact: true }) }).getByRole("button", { name: "+ 추가" }).click();
  for (const [label, v] of Object.entries(fill)) await dlg(page).getByLabel(label).fill(v);
  if (select) await dlg(page).getByLabel("구분").selectOption(select);
  await dlg(page).getByRole("button", { name: "저장" }).click();
  await expect(dlg(page)).toHaveCount(0);
}

test("원장: 수업 설정 — 과정·학기·과목·반", async ({ page }) => {
  await owner(page);
  await expect(page.getByRole("heading", { name: "설정" })).toBeVisible();
  await add(page, "과정", { "이름": "2028 영재학교반" });
  await add(page, "학기", { "이름": "[1차] 26년 8~12월" });
  await expect(page.getByRole("heading", { name: "대시보드" })).toBeVisible();
  await side(page).getByRole("link", { name: "설정" }).click();
  await add(page, "과목", { "이름": "대수", "이모지(선택)": "🧮" }, "수학");
  await add(page, "과목", { "이름": "물리", "이모지(선택)": "🍎" }, "과학");
  await add(page, "반", { "이름": "P반(Photon)" });
  await add(page, "반", { "이름": "Q반(Quantum)" });
  await shot(page, "11_수업_설정");
});

test("시간표 요약 → 주차 일괄 생성 → 상세", async ({ page }) => {
  await owner(page);
  await side(page).getByRole("link", { name: "시간표 요약" }).click();
  await page.getByRole("button", { name: "+ 시간대 추가" }).click();
  await dlg(page).getByLabel("요일").selectOption({ label: "토요일" });
  await dlg(page).getByLabel("시작").fill("18:30");
  await dlg(page).getByLabel("끝").fill("21:30");
  await dlg(page).getByRole("button", { name: "저장" }).click();
  await page.locator("table.tt tbody tr").first().locator("td").nth(1).click();
  await dlg(page).getByLabel("과목").selectOption({ label: "🧮 대수" });
  await dlg(page).getByRole("button", { name: "저장" }).click();
  await expect(page.locator("table.tt tbody")).toContainText("대수");
  await shot(page, "12_시간표_요약");
  await page.getByRole("button", { name: "주차 일괄 생성" }).click();
  await dlg(page).getByLabel("토요일 날짜").fill("2026-08-22");
  await dlg(page).getByRole("button", { name: "복사 생성하기" }).click();
  await expect(page.getByRole("heading", { name: "시간표 상세" })).toBeVisible();
  await expect(page.locator("table.tt tbody tr")).toHaveCount(1);
  await expect(page.locator("table.tt tbody")).toContainText("26-08-22 (토)");
  await page.getByRole("button", { name: "+ 휴강 추가" }).click();
  await dlg(page).getByLabel("날짜").fill("2026-09-26");
  await dlg(page).getByLabel("휴강 사유").fill("추석연휴 휴강");
  await dlg(page).getByRole("button", { name: "저장" }).click();
  await expect(page.locator("td.holnote")).toHaveText("추석연휴 휴강");
  await shot(page, "13_시간표_상세");
});

test("진도 수학: 주차 추가·칸 자동 저장 / 업무 일정 상태", async ({ page }) => {
  await owner(page);
  await side(page).getByRole("link", { name: "진도 수학" }).click();
  await page.getByRole("button", { name: "+ 주차 추가" }).click();
  await dlg(page).getByRole("button", { name: "저장" }).click();
  const cell = page.getByLabel("1주차 P반(Photon)");
  await cell.fill("S-Core 1 (Sec.1 Challenge)");
  await cell.blur();
  await expect(page.locator(".chip.ok", { hasText: "저장됨" })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("1주차 P반(Photon)")).toHaveValue("S-Core 1 (Sec.1 Challenge)");
  await shot(page, "14_진도_수학");
  await side(page).getByRole("link", { name: "업무 일정" }).click();
  await page.getByRole("button", { name: "+ 내용 추가" }).click();
  await page.locator("textarea.cellta").fill("수학팀 대면회의");
  await page.locator("textarea.cellta").blur();
  await page.getByRole("button", { name: "상태 바꾸기" }).click();
  await expect(page.getByRole("button", { name: "상태 바꾸기" })).toHaveText("🟢 완료");
  await shot(page, "15_업무_일정");
});
