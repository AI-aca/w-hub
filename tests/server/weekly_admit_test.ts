// 커트라인·1지망 판단·리포트 계산 단위 시험(DB 없음). 숫자는 손으로 계산한 값(문서 50 규칙).
// 참고사이트 admission·recommend·mockStats·fuSummary 와의 대조는 무작위 자료 10묶음(약 12만 건)으로 따로 함.
import { deepStrictEqual } from "node:assert";
import { admission, grpOf, GROUPS, isSchool, pvOf, recommend, SCHOOLS } from "../../supabase/functions/api/lib/weekly_admit.ts";
import { fuSummary, mockStats, pctOf, sg } from "../../supabase/functions/api/lib/weekly_report.ts";
const eq = (a: unknown, b: unknown, m?: string) => deepStrictEqual(a, b, m);

Deno.test("학교·그룹: 8개 학교가 4개 그룹에, 부산은 이름에만 붙음", () => {
  eq(SCHOOLS.length, 8); eq(GROUPS.length, 4);
  eq([grpOf("서울과학고"), grpOf("한국과학영재학교"), grpOf("대구과학고"), grpOf("세종과학예술영재학교"), grpOf("광주과학고"), grpOf("없는학교"), grpOf("")], [0, 0, 1, 2, 3, null, null]);
  eq([isSchool("경기과학고"), isSchool("경기"), isSchool("")], [true, false, false]);
});

Deno.test("판단 구간: 0 이상 안전, −10 이상 근접, −20 이상 소신, 그 아래 도전(경계 포함)", () => {
  eq([0, 12, -0.1, -10, -10.1, -20, -20.1, -300].map(pvOf), ["안전", "안전", "근접", "근접", "소신", "소신", "도전", "도전"]);
  eq(pvOf(null), null);
});

Deno.test("커트라인 판단: 커트라인이 있는 최근 3회만, 그룹마다 값이 있는 회차만 평균", () => {
  const trend = [1, 2, 3, 4, 5].map((round, i) => ({ round, math: 0, sci: 0, comp: 100 + 10 * i })); // 100,110,120,130,140
  // 회차 1은 커트라인 줄 없음, 2~5 있음 → 최근 3회 = 3·4·5. 그룹0 = 3:100, 4:빈 칸, 5:120 → 값 있는 3·5 만
  const cut = { 2: { 0: 90 }, 3: { 0: 100 }, 4: { 0: null, 1: 150 }, 5: { 0: 120 } };
  const a = admission(trend, cut);
  eq(a[0].rounds, [3, 5]); eq([a[0].cut, a[0].stu, a[0].m, a[0].pv], [110, 130, 20, "안전"]);
  eq(a[1].rounds, [4]); eq([a[1].cut, a[1].stu, a[1].m, a[1].pv], [150, 130, -20, "소신"]);
  eq([a[2].cut, a[2].stu, a[2].m, a[2].pv], [null, null, null, null]);
  eq(admission(trend, {}).every((x) => x.cut == null), true, "커트라인이 하나도 없으면 전부 빈 판단");
  eq(admission([], cut).every((x) => x.cut == null), true, "모의 종합이 없으면 빈 판단");
});

Deno.test("우리 판단: 안전인 첫 그룹, 없으면 차이가 가장 큰 그룹, 값이 없으면 null", () => {
  const g = (gi: number, m: number | null) => ({ gi, gname: GROUPS[gi], cut: m == null ? null : 100, stu: m == null ? null : 100 + m, m, pv: pvOf(m) });
  eq(recommend([g(0, -5), g(1, 3), g(2, 8), g(3, null)])!.gi, 1, "안전인 첫 그룹");
  eq(recommend([g(0, -30), g(1, -5), g(2, -12), g(3, null)])!.gi, 1, "차이가 가장 큰(가장 가까운) 그룹");
  eq(recommend([g(0, null), g(1, null), g(2, null), g(3, null)]), null);
});

Deno.test("백분위: 그 점수보다 낮은 학생 + 동점 절반, 반올림. 부호 문구", () => {
  eq([pctOf([10, 20, 30], 30), pctOf([10, 20, 30], 20), pctOf([10, 20, 30], 10), pctOf([20, 20], 20), pctOf([], 5)], [83, 50, 17, 50, null]);
  eq([sg(3), sg(-3.04), sg(0), sg(null)], ["+3.0", "−3.0", "+0.0", ""]);
});

Deno.test("모의 성적표: 수학·과학 과목이 모두 있어야 합계, 만점이 모두 있어야 환산(60:40 → 120+80)", () => {
  const subjects = [{ id: 1, name: "대수", category: "수학", sort: 1 }, { id: 2, name: "기하", category: "수학", sort: 2 }, { id: 3, name: "물리", category: "과학", sort: 3 }];
  const recs = [
    { student_id: "a", subject_id: 1, value: 30 }, { student_id: "a", subject_id: 2, value: 30 }, { student_id: "a", subject_id: 3, value: 24 },
    { student_id: "b", subject_id: 1, value: 20 }, { student_id: "b", subject_id: 3, value: 15 }, // b 는 기하 없음 → 수학 합계 없음
    { student_id: "z", subject_id: 1, value: 40 }, // 수강생 아님 → 무시
  ];
  const S = mockStats({ students: ["a", "b"], subjects, recs, max: { 1: 40, 2: 30, 3: 30 }, cw: { m: 60, s: 40 } });
  eq([S.mx, S.sx, S.cnt], [70, 30, 1]);
  eq([S.by.a.ms, S.by.a.ss, S.by.a.tot], [60, 24, 84]);
  // 환산: 수학 60/70×100×1.2 = 102.857…, 과학 24/30×100×0.8 = 64 → 166.857…
  const cm = 60 / 70 * 100 * 1.2;
  eq(Math.abs(S.by.a.cm! - cm) < 1e-9 && Math.abs(S.by.a.cs! - 64) < 1e-9 && Math.abs(S.by.a.conv! - (cm + 64)) < 1e-9, true);
  eq([S.by.b.ms, S.by.b.conv], [undefined, undefined], "기하가 없는 학생은 수학 합계도 환산도 없음");
  eq(S.sub[1].vals, [30, 20], "과목 평균·백분위는 그 과목 점수가 있는 학생 전체");
  eq(S.rank(S.by.a.conv!), 1);
  // 만점이 하나라도 없으면 환산 없음(합계는 있음)
  const N = mockStats({ students: ["a"], subjects, recs, max: { 1: 40, 2: null, 3: 30 }, cw: { m: 60, s: 40 } });
  eq([N.mx, N.by.a.ms, N.by.a.conv], [null, 60, undefined]);
  // 비율을 바꾸면 환산 비율도 같이: 50:50 → 100 + 100
  const H = mockStats({ students: ["a"], subjects, recs, max: { 1: 40, 2: 30, 3: 30 }, cw: { m: 50, s: 50 } });
  eq(Math.abs(H.by.a.cs! - 24 / 30 * 100) < 1e-9, true);
});

Deno.test("사후관리 한 줄: 1차는 없음, 지난 기간 안의 기록만 종류별 횟수(정해진 순서)", () => {
  const wins = [{ k: 1, upto: 3, from: "2027-01-16", to: "2027-02-06", label: "1/16 ~ 2/6" }, { k: 2, upto: 6, from: "2027-02-06", to: "2027-07-01", label: "2/6 ~ 6/30" }];
  const f = (d: string, kind: string, s = "a") => ({ student_id: s, on_date: d, kind });
  const L = [f("2027-01-20", "학부모 상담"), f("2027-01-21", "보충수업"), f("2027-01-22", "보충수업"), f("2027-02-06", "기타"), f("2027-01-15", "기타"), f("2027-01-30", "학생 상담", "b")];
  eq(fuSummary("a", 1, wins, L), null);
  eq(fuSummary("a", 2, wins, L), "지난 리포트 이후(1/16 ~ 2/6) 학원에서 보충수업 2회, 학부모 상담 1회를 진행했습니다.", "끝 날짜는 포함하지 않고, 시작 날짜는 포함");
  eq(fuSummary("c", 2, wins, L), null, "기록이 없으면 한 줄도 없음");
  eq(fuSummary("a", 3, wins, L), "지난 리포트 이후(2/6 ~ 6/30) 학원에서 기타 1회를 진행했습니다.", "3차는 2차 기간");
  eq(fuSummary("a", 4, wins, L), null, "없는 기간");
});
