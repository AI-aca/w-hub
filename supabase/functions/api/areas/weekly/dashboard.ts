// 평가 대시보드(성적·주말반 열람): 학기 × 반의 평가 계산 결과. 계산 규칙은 eval.ts(참고사이트와 같음).
// 반 = 지금 그 반 수강생. 반을 옮긴 학생은 예전 반에서 받은 기록도 함께 센다(원본과 같음).
import type { Tx } from "../../lib/db.ts";
import { defineAction } from "../../lib/registry.ts";
import { termOf } from "../../lib/scope.ts";
import { fail } from "../../lib/util.ts";
import { evaluate, type Rec } from "../../lib/weekly_eval.ts";
import { rules } from "./actions.ts";

export async function evalData(tx: Tx, termId: number, courseId: number, classId: number) {
  const [k] = await tx`select id from class.classes where id = ${classId} and course_id = ${courseId}`;
  if (!k) fail("이 과정의 반이 아닙니다.");
  const r = await rules(tx, courseId);
  const subjects = await tx`select id::int as id, name, category, sort from class.subjects where course_id = ${courseId}`;
  const sessions = await tx`select id::int as id, on_date::text as on_date, start_t, week_label, mock from class.sessions where term_id = ${termId} and kind = 'class'`;
  const students = await tx`select e.student_id, s.name, s.name_no from class.enrollments e join people.students s on s.id = e.student_id
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
  const out = evaluate({
    rules: { weights: r.weights, hw_scale: r.hw_scale, note_penalty: Number(r.note_penalty), cat_weights: r.cat_weights ?? { 수학: 60, 과학: 40 } },
    subjects: subjects as unknown as { id: number; name: string; category: string; sort: number }[],
    sessions: sessions as unknown as { id: number; on_date: string; start_t: string; week_label: string; mock: boolean }[],
    students: students as unknown as { student_id: string; name: string; name_no: number }[],
    records: records as unknown as Rec[],
    maxOf: (sid, sub) => mm.get(`${sid}:${sub}`) ?? (def[String(sub)] != null ? Number(def[String(sub)]) : null),
  });
  return { ...out, rules: r };
}

export default [
  defineAction({
    name: "evalClass", who: { area: "scores_weekly", need: "viewer" },
    run: async ({ tx, ws, body }) => {
      const t = await termOf(tx, ws, body.term_id);
      const d = await evalData(tx, t.id, t.course_id, Number(body.class_id));
      return { ok: true, rows: d.rows, st: d.st, weeks: d.weeks, missingMax: d.missingMax, subjects: d.subjects, cat_weights: d.rules.cat_weights, weights: d.rules.weights };
    },
  }),
];
