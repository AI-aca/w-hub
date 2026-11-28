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
  // 느린 서버(응답 0.7초)에서 내용을 고치고 바로 ★: 두 저장이 차례로, 내용도 ★도 남아야 함
  await page.route("**/api", async (r) => { await new Promise((x) => setTimeout(x, 700)); await r.continue(); });
  await page.getByLabel("1주차 P반(Photon)").fill("S-Core 1 (Sec.1~2)");
  await page.getByLabel("1주차 P반(Photon)").blur();
  await page.locator("td.txt", { has: page.getByLabel("1주차 P반(Photon)") }).getByRole("button", { name: "중요 표시" }).click();
  await expect(page.locator("td.txt.imp", { has: page.getByLabel("1주차 P반(Photon)") })).toBeVisible();
  await expect(page.locator("td.txt.saving")).toHaveCount(0);
  await page.unroute("**/api");
  await page.reload();
  await expect(page.getByLabel("1주차 P반(Photon)")).toHaveValue("S-Core 1 (Sec.1~2)");
  await expect(page.locator("td.txt.imp", { has: page.getByLabel("1주차 P반(Photon)") })).toBeVisible();
  await expect(page.locator(".toast.bad")).toHaveCount(0);
  await shot(page, "14_진도_수학");
  await side(page).getByRole("link", { name: "업무 일정" }).click();
  await page.getByRole("button", { name: "+ 내용 추가" }).click();
  // 느린 서버 흉내(응답 0.7초): 내용을 고치고 바로 상태를 눌러도 저장이 차례로 되는지(GitHub 시험에서 실패했던 경우)
  await page.route("**/api", async (r) => { await new Promise((x) => setTimeout(x, 700)); await r.continue(); });
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
  await expect(side(page).getByRole("link", { name: "대시보드", exact: true })).toBeVisible();
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

  // 만점은 평가 설정에서(원장), 회차 × 과목
  await side(page).getByRole("link", { name: "평가 설정" }).click();
  const mx = page.getByLabel("2026-08-22 대수 만점");
  await expect(mx).toHaveAttribute("placeholder", "미정");
  await mx.fill("50");
  await mx.blur();
  await expect(page.locator(".toast", { hasText: "만점을 저장했습니다" })).toBeVisible();

  await side(page).getByRole("link", { name: "성적 입력" }).click();
  await expect(page.getByRole("heading", { name: "성적 입력" })).toBeVisible();
  await expect(page.locator("table.wk tbody tr")).toHaveCount(2);
  await expect(page.locator(".content .note", { hasText: "모의고사 만점 50점" })).toBeVisible();
  const row = page.locator("table.wk tbody tr", { hasText: "김하나" });
  await expect(row.getByLabel("출결")).toHaveValue("");
  await expect(row.getByLabel("출결").locator("option:checked")).toHaveText("출석");
  await row.getByLabel("출결").selectOption("지각");
  await expect(page.locator(".note", { hasText: "저장됨" })).toBeVisible();
  await row.getByLabel("과제").selectOption("A");
  await row.getByLabel("mock").fill("45");
  await row.getByLabel("mock").blur();
  await row.getByLabel("교재 미지참").check();
  // 엑셀에서 붙여넣기: 이름 점수
  await page.getByRole("button", { name: "📋 엑셀에서 붙여넣기" }).click();
  await page.getByLabel("붙여넣을 항목").selectOption("test");
  await page.getByLabel("붙여넣을 내용").fill("김하나\t88\n이두리\t92");
  await page.getByRole("button", { name: "넣기", exact: true }).click();
  await expect(page.locator(".note b", { hasText: "2명에게 넣었습니다(이름으로 맞춤)" })).toBeVisible();
  await page.getByLabel("붙여넣을 내용").fill("없는학생 50");
  await page.getByRole("button", { name: "넣기", exact: true }).click();
  await expect(page.locator(".note b", { hasText: "찾지 못했거나 동명이인인 이름: 없는학생" })).toBeVisible();
  await page.reload();
  const r2 = page.locator("table.wk tbody tr", { hasText: "김하나" });
  await expect(r2.getByLabel("출결")).toHaveValue("지각");
  await expect(r2.getByLabel("과제")).toHaveValue("A");
  await expect(r2.getByLabel("test")).toHaveValue("88");
  await expect(r2.getByLabel("mock")).toHaveValue("45");
  await expect(r2.getByLabel("교재 미지참")).toBeChecked();
  await expect(page.locator("table.wk tbody tr", { hasText: "이두리" }).getByLabel("test")).toHaveValue("92");
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
  await page.getByLabel("대수 기본 만점").fill("40");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.locator(".toast", { hasText: "저장했습니다" }).first()).toBeVisible();
  await page.reload();
  await expect(page.locator("label", { hasText: "위클리테스트" }).locator("input")).toHaveValue("30");
  await expect(page.getByLabel("대수 기본 만점")).toHaveValue("40");
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
  await expect(side(page).getByRole("link")).toHaveText(["성적 입력", "입력 현황", "평가 대시보드", "모의고사 성적표", "학생 리포트", "집중관리", "과목 경보"]);
  await expect(page.locator("table.wk tbody tr")).toHaveCount(2);
});

test("왼쪽 메뉴 접기·펼치기(기억됨)", async ({ page }) => {
  await owner(page);
  await expect(side(page).getByRole("link", { name: "대시보드", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "메뉴 접기" }).click();
  await expect(page.locator("aside.side.mini")).toHaveCount(1);
  await expect(side(page).getByRole("link", { name: "대시보드", exact: true }).locator(".tx")).toBeHidden();
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

test("관리: 강사 소속 센터", async ({ page }) => {
  await prepare(page);
  await page.goto("/");
  await loginAs(page, "owner@test.kr", "원장");
  await page.getByRole("navigation", { name: "메뉴" }).getByRole("link", { name: "관리" }).click();
  await page.getByRole("link", { name: "센터·학교·강사" }).click();
  await page.locator(".card", { has: page.getByRole("heading", { name: "강사", exact: true }) }).getByRole("button", { name: "+ 추가" }).click();
  await dlg(page).getByLabel("이름").fill("소속선생");
  await dlg(page).getByLabel("소속 센터").selectOption({ label: "송도" });
  await dlg(page).getByRole("button", { name: "저장" }).click();
  await expect(dlg(page)).toHaveCount(0);
  await expect(page.locator(".item", { hasText: "소속선생" })).toContainText("송도");
  await page.locator(".item", { hasText: "소속선생" }).click();
  await expect(dlg(page).getByLabel("소속 센터").locator("option:checked")).toHaveText("송도");
  await shot(page, "20_강사_소속센터");
});

test("평가 대시보드: 반 명단·석차·학생 상세·그래프", async ({ page }) => {
  await owner(page);
  await side(page).getByRole("link", { name: "평가 대시보드" }).click();
  await expect(page.getByRole("heading", { name: "평가 대시보드" })).toBeVisible();
  const rows = page.locator("table.ev tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(page.locator(".kpi", { hasText: "P반(Photon) 인원" })).toContainText("2명");
  // 앞 시험에서 위클리테스트 가중치를 30 으로 바꿈 → 가중치 출결5·교재5·태도5·발표5·과제10·테스트30·모의50
  // 김하나: 지각(98)·교재 미지참(95)·태도 100·발표 0·과제 A(100)·테스트 88·모의 45/50(90)
  const kim = (5 * 98 + 5 * 95 + 5 * 100 + 5 * 0 + 10 * 100 + 30 * 88 + 50 * 90) / 110;
  // 이두리: 테스트 92 만 → 과제·모의는 값이 없어 빼고 나눔(출결·교재·태도 100, 발표 0)
  const lee = (5 * 100 + 5 * 100 + 5 * 100 + 5 * 0 + 30 * 92) / 50;
  await expect(rows.first()).toContainText("김하나");
  await expect(rows.first().locator("td").nth(2)).toHaveText(kim.toFixed(1));
  await expect(rows.nth(1).locator("td").nth(2)).toHaveText(lee.toFixed(1));
  await rows.nth(1).click();
  await expect(page.locator(".card .ch b", { hasText: "학생 상세 · 이두리" })).toBeVisible();
  await expect(page.locator("svg[aria-label='과목별 종합 점수']")).toBeVisible();
  await page.locator("table.ev th", { hasText: "최종" }).click();
  await expect(rows.first()).toContainText("김하나");
  await page.locator("table.ev th", { hasText: "최종" }).click();
  await expect(rows.first()).toContainText("이두리");
  await shot(page, "21_평가_대시보드");
  await page.locator("svg[aria-label='과목별 종합 점수']").scrollIntoViewIfNeeded();
  await shot(page, "22_학생_상세");
});

test("집중관리·과목 경보: 담임 지정, 사후관리 기록, 경보 조치, 성적 입력 경보", async ({ page }) => {
  await owner(page);
  await side(page).getByRole("link", { name: "설정", exact: true }).click();
  await page.locator(".item", { hasText: "P반(Photon)" }).click();
  await dlg(page).getByLabel("담임 강사").selectOption({ label: "소속선생" });
  await dlg(page).getByRole("button", { name: "저장" }).click();
  await expect(page.locator(".item", { hasText: "P반(Photon)" })).toContainText("담임 소속선생");

  await side(page).getByRole("link", { name: "집중관리" }).click();
  await expect(page.getByRole("heading", { name: "집중관리" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "지금까지" })).toBeVisible();
  const card = page.locator(".card", { hasText: "P반(Photon) 집중관리 대상" });
  await expect(card).toContainText("담임 소속선생 · 조치 0 / 2명");
  await expect(card.locator("tbody tr").first()).toContainText("이두리");
  await card.getByRole("button", { name: "+ 기록" }).first().click();
  await expect(card.getByLabel("작성 교사").locator("option:checked")).toHaveText("소속선생");
  await card.getByLabel("조치 유형").selectOption("학부모 상담");
  await card.getByLabel("내용").fill("전화 상담 15분");
  await card.getByRole("button", { name: "저장", exact: true }).click();
  await expect(card).toContainText("조치 1 / 2명");
  await expect(card.locator(".lg-line")).toContainText("학부모 상담");
  await shot(page, "23_집중관리_반별");
  await page.getByRole("tab", { name: "교사별" }).click();
  await expect(page.locator(".empty", { hasText: "담당 강사가 정해지면" })).toBeVisible();

  // 과제 C·D 2회 연속 → 경보
  const m = await apiCall(page, "classMeta");
  const term = m.terms[0].id, pClass = m.classes.find((c: { name: string }) => c.name.startsWith("P반")).id;
  const sub = m.subjects.find((x: { name: string }) => x.name === "대수").id, stf = m.staff.find((x: { name: string }) => x.name === "소속선생").id;
  const t = await apiCall(page, "sessionSave", { term_id: term, on_date: "2026-08-29", start_t: "18:30", end_t: "21:30", cells: [{ class_id: pClass, subject_id: sub, staff_id: stf }] });
  const s1 = t.sessions.find((x: { on_date: string }) => x.on_date === "2026-08-22").id, s2 = t.sessions.find((x: { on_date: string }) => x.on_date === "2026-08-29").id;
  const kim = (await apiCall(page, "weeklySheet", { session_id: s1, class_id: pClass })).students.find((x: { name: string }) => x.name === "김하나").student_id;
  await apiCall(page, "recordSave", { session_id: s1, class_id: pClass, student_id: kim, field: "hw", value: "C" });
  await apiCall(page, "recordSave", { session_id: s2, class_id: pClass, student_id: kim, field: "hw", value: "D" });
  await page.reload();
  await expect(side(page).getByRole("link", { name: "과목 경보" })).toContainText("1");
  await side(page).getByRole("link", { name: "과목 경보" }).click();
  await page.getByRole("tab", { name: "반별 (담임)" }).click();
  const row = page.locator("table.fu tbody tr", { hasText: "김하나" });
  await expect(row).toContainText("과제 C·D 2회 연속");
  await expect(row).toContainText("기한 경과");
  await expect(page.getByRole("button", { name: "📋 경보 요약 복사" })).toBeEnabled();
  await shot(page, "24_과목_경보");
  await row.getByRole("button", { name: "+ 조치" }).click();
  await page.getByLabel("내용").fill("과제 재제출 받음");
  await page.getByLabel("조치 유형").selectOption("과제 재제출");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("tab", { name: "처리할 경보 0" })).toBeVisible();
  await page.getByRole("tab", { name: /전체 1/ }).click();
  await expect(page.locator("table.fu tbody tr", { hasText: "김하나" })).toContainText("늦은 조치");
  await page.getByRole("tab", { name: "전체 현황" }).click();
  await expect(page.locator(".card", { hasText: "교사별 대응 현황" })).toContainText("소속선생");
  await side(page).getByRole("link", { name: "집중관리" }).click();
  await page.getByRole("tab", { name: "교사별" }).click();
  await expect(page.locator(".card", { hasText: "교사별 사후관리 현황" })).toContainText("P반(Photon) 대수");
  await expect(page.locator(".card", { hasText: "소속선생 · 과목 종합 하위 3명" }).locator("tbody tr", { hasText: "김하나" })).toContainText("과제 재제출");
  await shot(page, "26_집중관리_교사별");

  // 성적 입력: 그 칸의 이번 회 경보
  await page.goto(`/#/weiz/class/${term}/input/${s2}/${pClass}`);
  await expect(page.locator(".callout.al-in")).toContainText("이번 회 대수 경보 1명");
  await expect(page.locator(".callout.al-in")).toContainText("김하나");
  await shot(page, "25_성적입력_경보");
});
