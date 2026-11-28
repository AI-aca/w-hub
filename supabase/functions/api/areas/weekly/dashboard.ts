// 평가 대시보드(성적·주말반 열람): 학기 × 반의 평가 계산 결과. 계산 규칙은 lib/weekly_eval.ts(참고사이트와 같음).
// 반 = 지금 그 반 수강생. 반을 옮긴 학생은 예전 반에서 받은 기록도 함께 센다(원본과 같음).
import type { Tx } from "../../lib/db.ts";
import { defineAction } from "../../lib/registry.ts";
import { termOf } from "../../lib/scope.ts";
import { fail } from "../../lib/util.ts";
import { type Adm, admission, type Cut, GROUPS, grpOf, recommend, SCHOOLS } from "../../lib/weekly_admit.ts";
import { evaluate, type Rec, type Row, type Session, weeksOf } from "../../lib/weekly_eval.ts";
import { rules } from "./actions.ts";

/** 학기의 커트라인 표(회차 → 그룹 → 값). 회차 키가 있으면 그 회차에 커트라인 줄이 있다는 뜻(원본 cut[회차]). */
export async function cutOf(tx: Tx, termId: number): Promise<Cut> {
  const cut: Cut = {};
  for (const x of await tx`select round::int as round, grp::int as grp, value::float as value from class.cutlines where term_id = ${termId} order by round, grp`)
    (cut[x.round as number] = cut[x.round as number] ?? {})[x.grp as number] = x.value as number | null;
  return cut;
}
export type XRow = Row & { hope1: string; hope2: string; adm: Adm[]; h1: Adm | null; rec: Adm | null };

/** upto: 이 주(회차 번호)까지의 기록만으로 계산(집중관리 n차 리포트 기준). 없으면 전체. */
export async function evalData(tx: Tx, termId: number, courseId: number, classId: number, upto?: number) {
  const [k] = await tx`select id from class.classes where id = ${classId} and course_id = ${courseId}`;
  if (!k) fail("이 과정의 반이 아닙니다.");
  const r = await rules(tx, courseId);
  const subjects = await tx`select id::int as id, name, category, sort from class.subjects where course_id = ${courseId}`;
  let sessions = await tx`select id::int as id, on_date::text as on_date, start_t, week_label, mock from class.sessions where term_id = ${termId} and kind = 'class'` as unknown as Session[];
  if (upto != null) { const { weekOf } = weeksOf(sessions); sessions = sessions.filter((s) => (weekOf.get(s.id) ?? 0) <= upto); }
  const students = await tx`select e.student_id, s.name, s.name_no, e.hope1, e.hope2 from class.enrollments e join people.students s on s.id = e.student_id
                            where e.course_id = ${courseId} and e.class_id = ${classId} and e.status = 'active' order by s.name, s.name_no`;
  const ids = students.map((s) => s.student_id as string);
  const records = await tx`select r.session_id::int as session_id, r.student_id, c.subject_id::int as subject_id, r.att, r.book, r.beh, r.nt, r.hw, r.act,
                                  r.test::float as test, r.mock::float as mock
                           from class.records r join class.session_cells c on c.session_id = r.session_id and c.class_id = r.class_id
                           join class.sessions s on s.id = r.session_id where s.term_id = ${termId} and r.student_id = any(${ids})`;
  const maxes = await tx`select session_id::int as session_id, subject_id::int as subject_id, max_score::float as m from class.mock_max m
                         join class.sessions s on s.id = m.session_id where s.term_id = ${termId}`;
  const mm = new Map(maxes.map((x) => [`${x.session_id}:${x.subject_id}`, x.m as number]));
  const def = (r.mock_default ?? {}) as Record<string, number>;
  const cut = await cutOf(tx, termId);
  const hopes = new Map(students.map((s) => [s.student_id as string, { hope1: String(s.hope1 ?? ""), hope2: String(s.hope2 ?? "") }]));
  const out = evaluate({
    rules: { weights: r.weights, hw_scale: r.hw_scale, note_penalty: Number(r.note_penalty), cat_weights: r.cat_weights ?? { 수학: 60, 과학: 40 } },
    subjects: subjects as unknown as { id: number; name: string; category: string; sort: number }[],
    sessions,
    students: students as unknown as { student_id: string; name: string; name_no: number }[],
    records: records as unknown as Rec[],
    maxOf: (sid, sub) => mm.get(`${sid}:${sub}`) ?? (def[String(sub)] != null ? Number(def[String(sub)]) : null),
  });
  // 커트라인·1지망 판단: 학생마다 모의 종합 최근 3회(커트라인이 있는 회차)와 그룹별 안전선 비교
  for (const row of out.rows) {
    Object.assign(row, hopes.get(row.student_id) ?? { hope1: "", hope2: "" }, { adm: admission(row.trend, cut) });
    const x = row as unknown as XRow, g = grpOf(x.hope1);
    x.h1 = g != null ? x.adm[g] : null; x.rec = recommend(x.adm); // 1지망 판단(원본 r.h1)·우리 판단(원본 recommend)
  }
  return { ...out, rules: r, cut, rows: out.rows as XRow[], list: out.list as XRow[] };
}

export default [
  defineAction({
    name: "evalClass", who: { area: "scores_weekly", need: "viewer" },
    run: async ({ tx, ws, body }) => {
      const t = await termOf(tx, ws, body.term_id);
      const d = await evalData(tx, t.id, t.course_id, Number(body.class_id));
      return { ok: true, rows: d.rows, cut: d.cut, groups: GROUPS, schools: SCHOOLS, st: d.st, weeks: d.weeks, missingMax: d.missingMax, subjects: d.subjects, cat_weights: d.rules.cat_weights, weights: d.rules.weights };
    },
  }),
];
