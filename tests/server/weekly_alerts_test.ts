// 과목 경보·집중관리 기간 단위 시험(DB 없음). 숫자는 손으로 정한 값. 참고사이트 computeAlerts 와의 대조는 무작위 자료 7묶음으로 따로 함(문서 47).
import { deepStrictEqual } from "node:assert";
import { type ARec, computeAlerts } from "../../supabase/functions/api/lib/weekly_alerts.ts";
import { weeksOf } from "../../supabase/functions/api/lib/weekly_eval.ts";
import { cause, windowsOf } from "../../supabase/functions/api/lib/weekly_focus.ts";

const eq = (a: unknown, b: unknown, m?: string) => deepStrictEqual(a, b, m);
const day = (n: number) => `2026-09-${String(n).padStart(2, "0")}`;
// 1주 = 토요일 한 회차, 5주. 2·4주가 모의.
const sessions = [1, 2, 3, 4, 5].map((n) => ({ id: n, on_date: new Date(Date.UTC(2026, 8, 7 * n - 2)).toISOString().slice(0, 10), start_t: "18:30", week_label: `${n}주차`, mock: n === 2 || n === 4 }));
const cells = sessions.map((s) => ({ session_id: s.id, class_id: 1, subject_id: 10, staff_id: "t1" }));
const R = (sid: number, st: string, f: Partial<ARec>): ARec => ({ session_id: sid, class_id: 1, student_id: st, att: null, hw: null, nt: null, test: null, mock: null, ...f });
const base = {
  cfg: { drop: 15, gap: 20, rep: 2, days: 7 }, subjects: [{ id: 10, name: "대수", category: "수학" }], sessions, cells,
  students: [{ student_id: "a", name: "가", class_id: 1 }, { student_id: "b", name: "나", class_id: 1 }],
  maxOf: () => 50, follows: [], today: day(30),
};

Deno.test("경보 종류: 과제 C·D 연속, 노트 미흡 연속, 테스트 연속 하락, 결석·지각", () => {
  const out = computeAlerts({ ...base, records: [
    R(1, "a", { hw: "C", nt: 1, test: 90, att: "지각" }), R(2, "a", { hw: "D", nt: 1, test: 80 }), R(3, "a", { hw: "C", test: 70, att: "결석" }),
    R(4, "a", { test: 74 }), R(5, "a", { test: 60, att: "지각" }),
  ] });
  eq(out.map((a) => [a.week, a.rs.map((r) => r.x)]).reverse(), [
    [2, ["과제 C·D 2회 연속", "오답노트 미흡 2회 연속"]],
    [3, ["테스트 2회 연속 하락 (90 → 80 → 70)", "결석·지각 최근 3회 중 2회"]],
    [5, ["결석·지각 최근 3회 중 2회"]],
  ], "3주차 과제 C 는 이미 연속 중이라 다시 안 냄, 4주차 74 로 올라 테스트 하락은 끊김, 5주차는 직전 3회(2·3·4주) 중 1회라 새로 냄");
  eq([out[0].date, out[0].due], ["2026-10-03", "2026-10-10"], "기한 = 수업일 + 7일");
});

Deno.test("모의: 반 평균 대비 위치 하락·평균보다 낮음(100점 환산)", () => {
  const out = computeAlerts({ ...base, records: [
    R(2, "a", { mock: 40 }), R(2, "b", { mock: 30 }), // 평균 70 → 가 +10, 나 −10
    R(4, "a", { mock: 25 }), R(4, "b", { mock: 45 }), // 평균 70 → 가 −20(30 하락), 나 +20
  ] });
  eq(out.map((a) => [a.name, a.week, a.rs[0].x]), [["가", 4, "모의 반 평균 대비 +10.0 → −20.0 (30.0점 하락)"]], "하락 경보가 나면 '평균보다 낮음'은 겹쳐 내지 않음");
});

Deno.test("상태: 대응 대기 → 기한 경과, 조치 완료·늦은 조치", () => {
  const recs = [R(1, "a", { hw: "D" }), R(2, "a", { hw: "D" })]; // 2주차(9/12) 경보, 기한 9/19
  const st = (follows: { on_date: string; alert_key: string | null }[], today: string) =>
    computeAlerts({ ...base, records: recs, today, follows: follows.map((f) => ({ student_id: "a", subject_id: 10, ...f })) })[0];
  eq([st([], day(15)).st, st([], day(15)).left], ["wait", 4]);
  eq([st([], day(20)).st, st([], day(20)).left], ["over", -1]);
  eq([st([{ on_date: day(14), alert_key: null }], day(30)).st, st([{ on_date: day(14), alert_key: null }], day(30)).days], ["done", 2]);
  eq(st([{ on_date: day(25), alert_key: null }], day(30)).st, "late");
  eq(st([{ on_date: day(1), alert_key: null }], day(15)).st, "wait", "경보 전에 쓴 기록은 세지 않음");
  eq(st([{ on_date: day(1), alert_key: "a_10_2" }], day(15)).st, "done", "그 경보에서 쓴 기록이면 날짜와 무관");
});

Deno.test("집중관리 기간: 모의 3회마다, 3회 미만이면 '지금까지'", () => {
  const six = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, on_date: day(i * 4 + 1), start_t: "10:00", week_label: "", mock: i !== 3 }));
  const w = windowsOf(weeksOf(six).weeks, "2026-09-30");
  eq(w.map((x) => [x.k, x.upto, x.from, x.to, x.label]), [[1, 3, day(9), day(25), "9/9 ~ 9/25"], [2, 7, day(25), "2026-10-01", "9/25 ~ 9/30"]]);
  eq(windowsOf(weeksOf(sessions).weeks, null).map((x) => [x.k, x.label]), [[0, "지금까지"]]);
  eq(cause({ attendance: 100, textbook: 100, attitude: 94, activity: 0, homework: 60, test: 55, mock: 70, nt: 2, ded: 4, total: 0, actN: 0 }), "테스트 55.0 · 노트 미흡 2회 · 태도 지적 2회");
});
