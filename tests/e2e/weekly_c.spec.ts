// 3-2 C 화면 시험: 커트라인·1지망 판단(평가 대시보드), 학생 리포트, 모의고사 성적표, 엑셀 백업.
// 자료는 서버 기능으로 미리 넣는다(모두 무작위 아닌 정해진 가짜 자료, 실제 학생 아님). 다른 시험과 겹치지 않게 맨 마지막에 돈다(파일 이름순).
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { inflateRawSync } from "node:zlib";
import { loginAs, prepare } from "./fixtures";

test.describe.configure({ mode: "serial" });
const shots = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png` }); };
const API = "http://localhost:8000/api", SIGN = "http://localhost:8099/sign", ORIGIN = "http://localhost:5173";
// deno-lint-ignore no-explicit-any
type J = Record<string, any>;
const S: J = {};

async function token(rq: APIRequestContext, email: string): Promise<string> {
  const cred = await (await rq.get(`${SIGN}?email=${encodeURIComponent(email)}&name=${encodeURIComponent(email)}`)).text();
  return (await (await rq.post(API, { headers: { origin: ORIGIN }, data: { action: "login", credential: cred } })).json()).token;
}
async function call(rq: APIRequestContext, tk: string, action: string, body: J = {}): Promise<J> {
  const j = await (await rq.post(API, { headers: { origin: ORIGIN }, data: { action, token: tk, ws: "weiz", ...body } })).json();
  if (j.ok === false) throw new Error(`${action}: ${j.error}`);
  return j;
}

/** 과목별 모의 점수(만점 대수 40 · 물리 30)를 학생별 비율로 */
const PCT: Record<string, number[]> = {
  강나래: [95, 92, 96, 94, 97, 95], 김도윤: [78, 74, 80, 82, 79, 84], 박서연: [60, 66, 58, 55, 52, 49],
  이준호: [70, 72, 69, 73, 75, 77], 정하늘: [85, 88, 84, 90, 91, 93], 최민서: [45, 50, 48, 52, 47, 44],
};
const SAT = ["2026-03-07", "2026-03-14", "2026-03-21", "2026-03-28", "2026-04-04", "2026-04-11"];
const next = (d: string) => new Date(Date.parse(d + "T00:00:00Z") + 86400e3).toISOString().slice(0, 10);

test("준비: 과정·모의 6주·학생 6명·성적·조치 기록을 서버 기능으로 넣기", async ({ request }) => {
  S.owner = await token(request, "owner@test.kr");
  const o = S.owner;
  for (const e of ["wc-edit@test.kr", "wc-view@test.kr"]) await token(request, e);
  await call(request, o, "userSave", { email: "wc-edit@test.kr", status: "approved", memberships: [{ workspace_id: "weiz", area: "scores_weekly", role: "editor" }] });
  await call(request, o, "userSave", { email: "wc-view@test.kr", status: "approved", memberships: [{ workspace_id: "weiz", area: "scores_weekly", role: "viewer" }] });
  await call(request, o, "classSetup", { kind: "course", name: "주말특강 시험반" });
  const c = (await call(request, o, "classMeta")).courses.find((x: J) => x.name === "주말특강 시험반").id;
  await call(request, o, "classSetup", { kind: "term", course_id: c, name: "[시험] 26년 3~6월", starts_on: "2026-03-01", ends_on: "2026-06-30" });
  await call(request, o, "classSetup", { kind: "subject", course_id: c, name: "대수", category: "수학" });
  await call(request, o, "classSetup", { kind: "subject", course_id: c, name: "물리", category: "과학" });
  await call(request, o, "classSetup", { kind: "class", course_id: c, name: "시험A반" });
  await call(request, o, "staffSave", { name: "김수학" }); await call(request, o, "staffSave", { name: "이과학" });
  const m = await call(request, o, "classMeta");
  const term = m.terms.find((t: J) => t.course_id === c), cls = m.classes.find((k: J) => k.course_id === c);
  const sub = (n: string) => m.subjects.find((s: J) => s.course_id === c && s.name === n).id;
  const stf = (n: string) => m.staff.find((s: J) => s.name === n).id;
  Object.assign(S, { course: c, term: term.id, cls: cls.id, math: sub("대수"), sci: sub("물리") });
  const base = { course_id: c, weights: { att: 5, book: 5, beh: 5, act: 5, hw: 10, test: 20, mock: 50 }, hw_scale: { A: 100, B: 60, C: 20, D: 0 }, note_penalty: 2, alert: { drop: 15, gap: 20, rep: 2, days: 7 } };
  await call(request, o, "rulesSave", { ...base, mock_default: { [S.math]: 40, [S.sci]: 30 } });
  S.sess = [];
  for (const [i, d] of SAT.entries()) {
    const a = await call(request, o, "sessionSave", { term_id: term.id, on_date: d, start_t: "10:00", end_t: "12:00", week_label: `${i + 1}주`, mock: true, cells: [{ class_id: cls.id, subject_id: S.math, staff_id: stf("김수학") }] });
    const b = await call(request, o, "sessionSave", { term_id: term.id, on_date: next(d), start_t: "10:00", end_t: "12:00", week_label: `${i + 1}주`, mock: true, cells: [{ class_id: cls.id, subject_id: S.sci, staff_id: stf("이과학") }] });
    S.sess.push({ math: a.sessions.find((x: J) => x.on_date === d).id, sci: b.sessions.find((x: J) => x.on_date === next(d)).id });
  }
  S.stu = {};
  for (const n of Object.keys(PCT)) {
    const s = await call(request, o, "studentSave", { name: n });
    await call(request, o, "rosterAdd", { course_id: c, student_ids: [s.id] });
    const r = (await call(request, o, "rosterList", { course_id: c })).rows.find((x: J) => x.student_id === s.id);
    await call(request, o, "rosterSave", { course_id: c, student_id: s.id, ver: r.ver, class_id: cls.id });
    S.stu[n] = s.id;
  }
  const names = Object.keys(PCT);
  for (const [w, x] of S.sess.entries()) {
    const paste = (session_id: number, field: string, f: (n: string, i: number) => unknown) =>
      call(request, o, "recordsPaste", { session_id, class_id: cls.id, field, rows: names.map((n, i) => ({ student_id: S.stu[n], value: f(n, i) })) });
    await paste(x.math, "mock", (n) => Math.round(40 * PCT[n][w] / 100 * 2) / 2);
    await paste(x.sci, "mock", (n) => Math.round(30 * PCT[n][w] / 100 * 2) / 2);
    await paste(x.math, "test", (n, i) => Math.min(100, PCT[n][w] + 5 - i));
    await paste(x.math, "hw", (n) => (PCT[n][w] >= 85 ? "A" : PCT[n][w] >= 70 ? "B" : PCT[n][w] >= 55 ? "C" : "D"));
    await paste(x.sci, "nt", (n) => (PCT[n][w] < 55 ? 1 : 0));
    await paste(x.sci, "act", (n, i) => (i % 3));
  }
  // 커트라인 1~3회(서울·경기·한과영)는 미리 넣고, 4~6회는 화면에서 입력한다
  for (const [r, v] of [[1, 140], [2, 145], [3, 150]]) await call(request, o, "cutSave", { term_id: term.id, round: r, grp: 0, value: v });
  // 사후관리 기록: 2차 리포트의 '지난 기간(3회째 3/21 ~ 6회째 4/11 전)' 한 줄용
  for (const [n, d, k, b] of [["박서연", "2026-03-25", "보충수업", "오답 보충 40분"], ["박서연", "2026-04-01", "학부모 상담", "전화 15분"], ["최민서", "2026-03-30", "보충수업", "개념 보충"]]) {
    await call(request, o, "followupSave", { term_id: term.id, student_id: S.stu[n], subject_id: S.math, staff_id: stf("김수학"), on_date: d, kind: k, body: b });
  }
});

async function ownerAt(page: Page, path: string) {
  await prepare(page);
  await page.goto("/");
  await loginAs(page, "owner@test.kr", "원장");
  await expect(page.getByRole("navigation", { name: "메뉴" })).toBeVisible(); // 로그인이 끝난 뒤에 주소를 옮긴다
  await page.goto(`/#/weiz/class/${S.term}/${path}`);
}

test("커트라인·1지망: 평가 대시보드에 입력하고 판단이 붙음", async ({ page }) => {
  await ownerAt(page, `dash/${S.cls}`);
  await expect(page.getByRole("heading", { name: "평가 대시보드" })).toBeVisible();
  await expect(page.locator(".card", { hasText: "회차별 모의고사 커트라인" })).toBeVisible();
  const cut = (round: number, g: string) => page.getByLabel(`${round}회 ${g} 커트라인`);
  // 모의 종합 200점 환산 최근 3회 평균 기준: 그룹0 안전선 150~160, 그룹1 140
  // 칸 하나를 고치고 서버 응답이 올 때까지 기다린 뒤 다음 칸으로(토스트 글자는 겹쳐 보여 기준이 못 됨)
  const put = async (r: number, g: string, v: string) => {
    await cut(r, g).fill(v);
    await Promise.all([page.waitForResponse((res) => (res.request().postData() ?? "").includes('"cutSave"')), cut(r, g).press("Tab")]);
  };
  for (const [r, v] of [[4, "150"], [5, "155"], [6, "160"]] as [number, string][]) await put(r, "서울·경기·한과영", v);
  await put(6, "인천·대구", "140");
  await expect(cut(6, "인천·대구")).toHaveValue("140");
  await put(6, "서울·경기·한과영", "999");
  await expect(page.getByText("커트라인은 0~200점 사이로 입력하세요.").first()).toBeVisible();
  await expect(cut(6, "서울·경기·한과영")).toHaveValue("160"); // 거절되면 다시 불러온 값
  // 학생 상세에서 1지망 고르기 → 표의 '1지망 판단' 칸·KPI
  const rows = page.locator("table.ev tbody tr");
  await expect(rows).toHaveCount(6);
  // 이준호: 최근 3회 평균 약 150 → 그룹0 안전선 평균 155 보다 5점 모자라 '근접', 그룹1(140, 6회만)은 안전 → 우리 판단 = 인천·대구
  await rows.filter({ hasText: "이준호" }).click();
  await expect(page.locator(".card .ch b", { hasText: "학생 상세 · 이준호" })).toBeVisible();
  await page.getByLabel("1지망").selectOption({ label: "서울과학고" });
  await page.getByLabel("2지망").selectOption({ label: "대구과학고" });
  const row = rows.filter({ hasText: "이준호" });
  await expect(row.locator("td").last()).toContainText("서울과학고");
  await expect(row.locator("td").last().locator(".chip")).toHaveText("근접");
  await expect(page.locator(".rec")).toContainText("인천·대구");
  await expect(page.locator(".rec")).toContainText("1지망 서울과학고 → 근접");
  await expect(page.locator(".rec")).toContainText("2지망 대구과학고 → 안전");
  await shot(page, "32_학생_상세_지원가능");
  await rows.filter({ hasText: "강나래" }).click();
  await expect(page.locator(".card .ch b", { hasText: "학생 상세 · 강나래" })).toBeVisible(); // 상세가 바뀐 뒤에 고른다
  await page.getByLabel("1지망").selectOption({ label: "경기과학고" });
  await expect(rows.filter({ hasText: "강나래" }).locator("td").last().locator(".chip")).toHaveText("안전");
  await expect(page.locator(".kpi", { hasText: "1지망 안전선 통과" })).toContainText("1명");
  await expect(page.locator("table.t", { hasText: "커트라인 그룹 (영재학교)" })).toBeVisible();
  await page.locator(".content").evaluate((el) => { el.scrollTop = 0; });
  await shot(page, "31_커트라인_1지망_판단");
  // 새로고침해도 남아 있음(DB 저장)
  await page.reload();
  await expect(page.getByLabel("6회 서울·경기·한과영 커트라인")).toHaveValue("160");
  await page.locator("table.ev tbody tr").filter({ hasText: "이준호" }).click();
  await expect(page.getByLabel("1지망")).toHaveValue("서울과학고");
});

test("집중관리 반별 표에 1지망 판단 칸", async ({ page }) => {
  await ownerAt(page, "focus");
  await expect(page.locator("th", { hasText: "1지망 판단" }).first()).toBeVisible();
  await shot(page, "33_집중관리_1지망_판단");
});

test("학생 리포트: 1차·2차, 총평 고치기, 사후관리 한 줄, 인쇄용 3쪽", async ({ page }) => {
  await ownerAt(page, `report/${S.cls}/1`);
  await expect(page.getByRole("heading", { name: "학생 리포트" })).toBeVisible();
  await expect(page.locator(".rp-page")).toHaveCount(3);
  await page.getByLabel("학생").selectOption({ label: "강나래" });
  await expect(page.locator(".namebox")).toHaveText("강나래");
  await expect(page.locator(".rp-sum textarea")).toHaveValue(/강나래 학생은 1차 기간\(모의고사 1~3회\)/);
  await expect(page.locator(".rp-kpi")).toContainText("모의고사 환산 총점 (200)");
  await expect(page.locator("svg[aria-label='모의고사 종합 추이(200점)']")).toBeVisible();
  await expect(page.locator(".rp-page").nth(1)).toContainText("모의고사 성적표");
  await expect(page.locator(".rp-page").nth(2)).toContainText("다음 리포트까지 실행 계획");
  await expect(page.locator(".rp-care")).toHaveCount(0); // 1차에는 사후관리 한 줄 없음
  await shot(page, "34_리포트_화면");
  await expect(page.locator(".rp-page").nth(1)).toContainText("1지망");
  await expect(page.locator(".rp-page").nth(0)).toContainText("1지망 합격 안전선");
  await page.setViewportSize({ width: 1360, height: 1500 }); // 쪽 하나가 한 화면에 다 들어오게
  for (const [i, nm] of ["35_리포트_1쪽", "36_리포트_2쪽", "37_리포트_3쪽"].entries()) await page.locator(".rp-page").nth(i).screenshot({ path: shots ? `${shots}/${nm}.png` : undefined });
  // 인쇄(PDF 저장) 모양: 인쇄용 화면으로 바꿔 PDF 를 만들면 A4 3쪽, 화면 머리·메뉴는 빠짐
  await page.emulateMedia({ media: "print" });
  await page.evaluate(() => document.body.classList.add("pr-one"));
  await expect(page.locator(".top")).toBeHidden();
  const pdf = await page.pdf({ preferCSSPageSize: true });
  expect((pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(3);
  await page.evaluate(() => document.body.classList.remove("pr-one"));
  await page.emulateMedia({ media: "screen" });
  // 총평 고치기 → 저장 → 다시 열어도 유지 → 자동 문안으로 되돌리기
  const ta = page.locator(".rp-sum textarea");
  await ta.fill("직접 쓴 총평입니다.");
  await ta.press("Tab");
  await expect(page.locator(".rp-tools")).toContainText("저장된 총평");
  await page.reload();
  await page.getByLabel("학생").selectOption({ label: "강나래" });
  await expect(page.locator(".rp-sum textarea")).toHaveValue("직접 쓴 총평입니다.");
  await page.getByRole("button", { name: "자동 문안 다시 넣기" }).click();
  await expect(page.locator(".rp-sum textarea")).toHaveValue(/강나래 학생은 1차 기간/);
  // 2차: 지난 기간 사후관리 한 줄(박서연 = 보충수업 1회, 학부모 상담 1회)
  await page.getByRole("tab", { name: /^2차/ }).click();
  await page.getByLabel("학생").selectOption({ label: "박서연" });
  await expect(page.locator(".rp-care")).toContainText("지난 리포트 이후(3/21 ~ 4/11) 학원에서 보충수업 1회, 학부모 상담 1회를 진행했습니다.");
  await expect(page.locator("svg[aria-label='모의고사 종합 추이(200점)']")).toBeVisible();
  await shot(page, "38_리포트_2차_사후관리");
  await page.locator(".rp-page").nth(2).screenshot({ path: shots ? `${shots}/39_리포트_2차_3쪽.png` : undefined });
  await page.locator(".rp-page").nth(1).screenshot({ path: shots ? `${shots}/39_리포트_2차_2쪽.png` : undefined });
});

test("모의고사 성적표: 회차·반, 평균·백분위·환산·석차", async ({ page }) => {
  await ownerAt(page, "mock");
  await expect(page.getByRole("heading", { name: "모의고사 성적표" })).toBeVisible();
  const rows = page.locator("table.mk tbody tr:not(.sub-h)");
  await expect(rows).toHaveCount(6);
  await expect(rows.first()).toContainText("강나래"); // 마지막 회차 환산 1등
  await expect(rows.first().locator("td").last()).toHaveText("1");
  await page.getByRole("tab", { name: "2회", exact: true }).click();
  await expect(page.locator(".card .ch b", { hasText: "2회 · 3/14" })).toBeVisible();
  await shot(page, "40_모의고사_성적표");
});

test("성적 보기 권한만: 커트라인·지망 입력칸이 잠김, 입력 권한은 지망만", async ({ page }) => {
  await prepare(page);
  await page.goto("/");
  await loginAs(page, "wc-view@test.kr");
  await expect(page.getByRole("navigation", { name: "메뉴" })).toBeVisible();
  await page.goto(`/#/weiz/class/${S.term}/dash/${S.cls}`);
  await expect(page.getByLabel("6회 서울·경기·한과영 커트라인")).toBeDisabled();
  await page.locator("table.ev tbody tr").first().click();
  await expect(page.getByLabel("1지망")).toBeDisabled();
});

test("입력 권한 선생님: 지망은 고치고 커트라인은 못 고침", async ({ page }) => {
  await prepare(page);
  await page.goto("/");
  await loginAs(page, "wc-edit@test.kr");
  await expect(page.getByRole("navigation", { name: "메뉴" })).toBeVisible();
  await page.goto(`/#/weiz/class/${S.term}/dash/${S.cls}`);
  await expect(page.getByLabel("6회 서울·경기·한과영 커트라인")).toBeDisabled();
  await page.locator("table.ev tbody tr").filter({ hasText: "최민서" }).click();
  await expect(page.getByLabel("1지망")).toBeEnabled();
});

test("엑셀 백업: 내려받은 .xlsx 의 시트 6개와 내용", async ({ page }) => {
  await ownerAt(page, "status");
  await expect(page.getByRole("heading", { name: "입력 현황" })).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "엑셀로 내보내기 (백업)" }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^주말반_.+_백업_\d{8}\.xlsx$/);
  const path = await dl.path();
  const buf = (await import("node:fs")).readFileSync(path);
  expect(buf.subarray(0, 4).toString("hex")).toBe("504b0304"); // zip 머리
  // 압축 안 한 zip 의 중앙 목록을 직접 읽어 파일 이름과 내용을 확인
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const n = buf.readUInt16LE(eocd + 10), cdOff = buf.readUInt32LE(eocd + 16);
  const files: Record<string, string> = {};
  let p = cdOff;
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), cmLen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    const dStart = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
    const raw = buf.subarray(dStart, dStart + csize);
    files[name] = (method === 0 ? raw : inflateRawSync(raw)).toString("utf8");
    p += 46 + nameLen + extraLen + cmLen;
  }
  expect(Object.keys(files).sort()).toEqual(["[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/workbook.xml",
    ...[1, 2, 3, 4, 5, 6].map((i) => `xl/worksheets/sheet${i}.xml`)].sort());
  for (const nm of ["학생", "성적기록", "모의고사", "사후관리", "커트라인", "모의고사 만점"]) expect(files["xl/workbook.xml"]).toContain(`name="${nm}"`);
  expect(files["xl/worksheets/sheet1.xml"]).toContain("강나래");
  expect(files["xl/worksheets/sheet1.xml"]).toContain("서울과학고"); // 위 시험에서 고른 지망
  expect(files["xl/worksheets/sheet5.xml"]).toContain("<v>160</v>"); // 커트라인 6회
  expect(files["xl/worksheets/sheet4.xml"]).toContain("오답 보충 40분");
  for (const f of Object.values(files)) expect(f).not.toContain("010-");
  await shot(page, "41_입력현황_백업_버튼");
});
