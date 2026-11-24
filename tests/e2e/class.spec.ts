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
  await side(page).getByRole("link", { name: "설정", exact: true }).click();
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

/** 화면 뒤에서 서버를 바로 부른다(준비용: 학생 등록·반 배정·권한). 토큰은 로그인한 브라우저 것. */
async function apiCall(page: Page, action: string, body: Record<string, unknown> = {}) {
  return await page.evaluate(async ([a, b]) => {
    const r = await fetch("http://localhost:8000/api", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...(b as object), action: a, ws: "weiz", token: localStorage.getItem("whub_token") }) });
    return await r.json();
  }, [action, body] as const);
}

test("평가: 모의 회차 지정 → 성적 입력(칸마다 저장) → 입력 현황 → 평가 설정", async ({ page }) => {
  await owner(page);
  await expect(side(page).getByRole("link", { name: "대시보드" })).toBeVisible();
  const m = await apiCall(page, "classMeta");
  const course = m.courses[0].id, pClass = m.classes.find((c: { name: string }) => c.name.startsWith("P반")).id;
  for (const name of ["김하나", "이두리"]) {
    const s = await apiCall(page, "studentSave", { name });
    await apiCall(page, "rosterAdd", { course_id: course, student_ids: [s.id] });
    await apiCall(page, "rosterSave", { course_id: course, student_id: s.id, ver: 1, class_id: pClass });
  }
  await side(page).getByRole("link", { name: "시간표 상세" }).click();
  await page.locator("table.tt tbody tr").first().locator("td").nth(1).click();
  await dlg(page).getByLabel(/모의고사 회차/).check();
  await dlg(page).getByRole("button", { name: "저장" }).click();
  await expect(page.locator("table.tt tbody tr").first()).toContainText("모의");

  await side(page).getByRole("link", { name: "성적 입력" }).click();
  await expect(page.getByRole("heading", { name: "성적 입력" })).toBeVisible();
  await expect(page.locator("table.wk tbody tr")).toHaveCount(2);
  await page.getByRole("button", { name: "모두 출석" }).click();
  await expect(page.locator("table.wk tbody tr").first().getByLabel("출결")).toHaveValue("출석");
  const row = page.locator("table.wk tbody tr", { hasText: "김하나" });
  await row.getByLabel("과제").selectOption("A");
  await expect(page.locator(".note", { hasText: "저장됨" })).toBeVisible();
  await row.getByLabel("test").fill("88");
  await row.getByLabel("test").blur();
  await page.locator(".note", { hasText: "모의고사 만점" }).locator("input").fill("50");
  await page.locator(".note", { hasText: "모의고사 만점" }).locator("input").blur();
  await expect(page.locator(".toast", { hasText: "만점을 저장했습니다" })).toBeVisible();
  await row.getByLabel("mock").fill("45");
  await row.getByLabel("mock").blur();
  await row.getByLabel("교재 미지참").check();
  await expect.poll(async () => (await apiCall(page, "weeklyStatus", { term_id: m.terms[0].id })).rows[0]?.filled).toBe(2);
  await page.reload();
  const r2 = page.locator("table.wk tbody tr", { hasText: "김하나" });
  await expect(r2.getByLabel("과제")).toHaveValue("A");
  await expect(r2.getByLabel("test")).toHaveValue("88");
  await expect(r2.getByLabel("mock")).toHaveValue("45");
  await expect(r2.getByLabel("교재 미지참")).toBeChecked();
  await shot(page, "16_성적_입력");

  await side(page).getByRole("link", { name: "입력 현황" }).click();
  await expect(page.locator("button.stc.ok")).toHaveText("2/2");
  await shot(page, "17_입력_현황");
  await page.locator("button.stc.ok").click();
  await expect(page.getByRole("heading", { name: "성적 입력" })).toBeVisible();

  await side(page).getByRole("link", { name: "평가 설정" }).click();
  const w = page.locator("label", { hasText: "위클리테스트" }).locator("input");
  await expect(w).toHaveValue("20");
  await w.fill("30");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.locator(".toast", { hasText: "저장했습니다" })).toBeVisible();
  await page.reload();
  await expect(page.locator("label", { hasText: "위클리테스트" }).locator("input")).toHaveValue("30");
  await shot(page, "18_평가_설정");

  // 선생님(성적·주말반 입력만): 수업 메뉴 안에서 평가 화면만 보임
  const u = await apiCall(page, "userSave", { email: "t2@test.kr", name: "선생님", status: "approved", memberships: [{ workspace_id: "weiz", area: "scores_weekly", role: "editor" }] });
  expect(u.ok).toBe(true);
});

test("성적 권한만 있는 선생님: 평가 화면만, 시간표는 못 봄", async ({ page }) => {
  await prepare(page);
  await page.goto("/");
  await loginAs(page, "t2@test.kr", "선생님");
  await page.getByRole("navigation", { name: "메뉴" }).getByRole("link", { name: "수업" }).click();
  await expect(page.getByRole("heading", { name: "성적 입력" })).toBeVisible();
  await expect(side(page).getByRole("link")).toHaveText(["성적 입력", "입력 현황"]);
  await expect(page.locator("table.wk tbody tr")).toHaveCount(2);
});

test("왼쪽 메뉴 접기·펼치기(기억됨)", async ({ page }) => {
  await owner(page);
  await expect(side(page).getByRole("link", { name: "대시보드" })).toBeVisible();
  await page.getByRole("button", { name: "메뉴 접기" }).click();
  await expect(page.locator("aside.side.mini")).toHaveCount(1);
  await expect(side(page).getByRole("link", { name: "대시보드" }).locator(".tx")).toBeHidden();
  await expect(page.getByLabel("과정")).toBeHidden();
  await page.reload();
  await expect(page.locator("aside.side.mini")).toHaveCount(1);
  await expect.poll(async () => (await page.locator("aside.side").boundingBox())?.width).toBeLessThan(70);
  await shot(page, "19_메뉴_접힘");
  await side(page).getByRole("link", { name: "시간표 상세" }).click();
  await expect(page.getByRole("heading", { name: "시간표 상세" })).toBeVisible();
  await page.getByRole("button", { name: "메뉴 펼치기" }).click();
  await expect(page.locator("aside.side.mini")).toHaveCount(0);
  await expect(page.getByLabel("과정")).toBeVisible();
});
