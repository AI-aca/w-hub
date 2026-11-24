// 평가 계산 단위 시험(DB 없음). 숫자는 손으로 계산한 값(문서 47 규칙). 참고사이트 computeEval 과의 대조는 무작위 자료 5묶음으로 따로 함.
import { deepStrictEqual } from "node:assert";
import { evaluate, weeksOf } from "../../supabase/functions/api/lib/weekly_eval.ts";

const near = (a: number | null | undefined, b: number, m: string) => { if (a == null || Math.abs(a - b) > 1e-9) throw new Error(`${m}: ${a} ≠ ${b}`); };
const R = (session_id: number, student_id: string, subject_id: number, f: Record<string, unknown>) =>
  ({ session_id, student_id, subject_id, att: null, book: null, beh: null, nt: null, hw: null, act: null, test: null, mock: null, ...f });
const base = {
  rules: { weights: { att: 5, book: 5, beh: 5, act: 5, hw: 10, test: 20, mock: 50 }, hw_scale: { A: 100, B: 60, C: 20, D: 0 }, note_penalty: 2, cat_weights: { 수학: 60, 과학: 40 } },
  subjects: [{ id: 1, name: "대수", category: "수학", sort: 1 }, { id: 2, name: "물리", category: "과학", sort: 2 }],
  sessions: [
    { id: 1, on_date: "2026-09-05", start_t: "18:30", week_label: "1주차", mock: false }, { id: 2, on_date: "2026-09-06", start_t: "15:00", week_label: "1주차", mock: false },
    { id: 3, on_date: "2026-09-12", start_t: "18:30", week_label: "2주차", mock: true }, { id: 4, on_date: "2026-09-13", start_t: "15:00", week_label: "2주차", mock: true },
  ],
  students: [{ student_id: "a", name: "가", name_no: 1 }, { student_id: "b", name: "나", name_no: 1 }],
  maxOf: (s: number, sub: number) => (s === 3 && sub === 1 ? 40 : s === 4 && sub === 2 ? 30 : null),
};

Deno.test("주차 묶기: 같은 주차 이름 = 한 회차, 모의 주차에 모의 번호", () => {
  const { weeks, weekOf } = weeksOf(base.sessions);
  deepStrictEqual(weeks.map((w) => [w.no, w.label, w.mock, w.round]), [[1, "1주차", false, null], [2, "2주차", true, 1]]);
  deepStrictEqual([...weekOf.entries()], [[1, 1], [2, 1], [3, 2], [4, 2]]);
});

Deno.test("과목 종합·수학·과학·최종·모의 종합(손 계산)", () => {
  const out = evaluate({ ...base, records: [
    R(1, "a", 1, { att: "지각", hw: "A", test: 80, beh: 1 }), R(2, "a", 2, { att: "결석", book: true, test: 60, nt: 1 }),
    R(3, "a", 1, { test: 90, mock: 30 }), R(4, "a", 2, { mock: 15, act: 2 }),
    R(1, "b", 1, { test: 100 }),
  ] });
  const a = out.rows.find((r) => r.student_id === "a")!;
  near(a.comp[1].attendance, 98, "대수 출결"); near(a.comp[1].attitude, 97, "대수 태도"); near(a.comp[1].test, 85, "대수 테스트"); near(a.comp[1].mock, 75, "대수 모의");
  near(a.sub[1], 79.25, "대수 종합");
  near(a.comp[2].attendance, 95, "물리 출결"); near(a.comp[2].textbook, 95, "물리 교재"); near(a.comp[2].activity, 10, "물리 발표"); near(a.comp[2].ded, 2, "노트 감점");
  near(a.sub[2], 5200 / 90 - 2, "물리 종합(과제 없음 → 그 항목 빼고)");
  near(a.final, 0.6 * 79.25 + 0.4 * (5200 / 90 - 2), "최종 60:40");
  deepStrictEqual(a.trend.map((t) => [t.round, t.comp]), [[1, 1.2 * 75 + 0.8 * 50]]);
  deepStrictEqual(a.ntBy, { m: {}, s: { 1: 1 } });
  const b = out.rows.find((r) => r.student_id === "b")!;
  deepStrictEqual([b.sci, b.trend.length], [null, 0], "과학 기록 없으면 과학 없음, 모의 종합 없음");
  near(b.final, b.math!, "한쪽만 있으면 그쪽");
  deepStrictEqual(out.list.map((r) => [r.student_id, r.rank]), [["b", 1], ["a", 2]]);
  near(out.st.final, (a.final! + b.final!) / 2, "반 평균");
});

Deno.test("같은 주 토·일 출결은 가장 나쁜 것 하나, 만점 없으면 모의 빼고 개수 셈", () => {
  const out = evaluate({ ...base,
    subjects: [{ id: 1, name: "대수", category: "수학", sort: 1 }],
    sessions: [...base.sessions, { id: 5, on_date: "2026-09-13", start_t: "19:00", week_label: "2주차", mock: true }],
    records: [R(3, "a", 1, { att: "지각" }), R(5, "a", 1, { att: "결석", mock: 20 })] });
  const a = out.rows[0];
  near(a.comp[1].attendance, 95, "결석 1회만");
  deepStrictEqual([a.comp[1].mock, out.missingMax], [null, 1]);
});
