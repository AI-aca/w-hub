// 주말반 평가(성적·주말반 권한): 회차 칸 입력표, 입력 현황, 평가 규칙
// 입력표 한 장 = 시간표 상세의 칸 하나(회차 × 반). 칸을 고치면 그 칸만 저장(다른 선생님 칸을 덮지 않음).
import type { Tx } from "../../lib/db.ts";
import { log } from "../../lib/audit.ts";
import { defineAction } from "../../lib/registry.ts";
import { cellOf, courseOf, termOf } from "../../lib/scope.ts";
import { fail, str } from "../../lib/util.ts";

const FIELDS = ["att", "book", "beh", "nt", "hw", "act", "test", "mock"] as const;
type Field = typeof FIELDS[number];

function clean(f: Field, v: unknown): string | number | boolean | null {
  if (v == null || v === "") return null;
  if (f === "att") { const s = str(v, 4); if (!["출석", "지각", "결석"].includes(s)) fail("출결 값이 올바르지 않습니다."); return s; }
  if (f === "hw") { const s = str(v, 1); if (!["A", "B", "C", "D"].includes(s)) fail("과제는 A~D 입니다."); return s; }
  if (f === "book") return v === true || v === 1 || v === "1";
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) fail("0 이상의 숫자를 넣으세요.");
  if (["beh", "nt", "act"].includes(f)) { if (!Number.isInteger(n) || n > 50) fail("횟수는 0~50 입니다."); return n; }
  if (f === "test" && n > 100) fail("위클리테스트는 100점까지입니다.");
  return Math.round(n * 10) / 10;
}

const DEF = { weights: { att: 5, book: 5, beh: 5, act: 5, hw: 10, test: 20, mock: 50 }, hw_scale: { A: 100, B: 60, C: 20, D: 0 }, note_penalty: 2, alert: { drop: 15, gap: 20, rep: 2, days: 7 } };
async function rules(tx: Tx, courseId: number) {
  const [r] = await tx`select weights, hw_scale, note_penalty::float as note_penalty, alert, updated_at, updated_by from class.rules where course_id = ${courseId}`;
  return r ?? { ...DEF, updated_at: null, updated_by: "" };
}

async function sheet(tx: Tx, c: { session_id: number; class_id: number; course_id: number }) {
  const [info] = await tx`select s.on_date::text as on_date, s.start_t, s.end_t, s.week_label, s.mock, sc.mock_max::float as mock_max,
                                 sb.name as subject, sb.category, f.name as staff, f.email as staff_email, k.name as class_name
                          from class.sessions s join class.session_cells sc on sc.session_id = s.id and sc.class_id = ${c.class_id}
                          join class.classes k on k.id = sc.class_id left join class.subjects sb on sb.id = sc.subject_id
                          left join org.staff f on f.id = sc.staff_id where s.id = ${c.session_id}`;
  const students = await tx`select e.student_id, s.name, s.name_no from class.enrollments e join people.students s on s.id = e.student_id
                            where e.course_id = ${c.course_id} and e.class_id = ${c.class_id} and e.status = 'active' order by s.name, s.name_no`;
  const records = await tx`select student_id, att, book, beh, nt, hw, act, test::float as test, mock::float as mock, ver, updated_by
                           from class.records where session_id = ${c.session_id} and class_id = ${c.class_id}`;
  return { ok: true, info, students, records };
}

export default [
  defineAction({
    name: "weeklySheet", who: { area: "scores_weekly", need: "viewer" },
    run: async ({ tx, ws, body }) => await sheet(tx, await cellOf(tx, ws, body.session_id, body.class_id)),
  }),

  /** 칸 하나 저장. 없던 줄이면 만든다. */
  defineAction({
    name: "recordSave", who: { area: "scores_weekly", need: "editor" },
    run: async ({ tx, ws, body, me }) => {
      const c = await cellOf(tx, ws, body.session_id, body.class_id);
      const f = str(body.field, 10) as Field;
      if (!FIELDS.includes(f)) fail("알 수 없는 항목입니다.");
      const v = clean(f, body.value);
      const sid = str(body.student_id, 40);
      if (!(await tx`select 1 from class.enrollments where course_id = ${c.course_id} and student_id = ${sid}`).length) fail("이 과정의 수강생이 아닙니다.");
      if (f === "mock" && v != null) {
        const [m] = await tx`select s.mock, sc.mock_max::float as mx from class.sessions s join class.session_cells sc on sc.session_id = s.id
                             where s.id = ${c.session_id} and sc.class_id = ${c.class_id}`;
        if (!m.mock) fail("모의고사 회차가 아닙니다.");
        if (m.mx != null && Number(v) > m.mx) fail(`만점(${m.mx})을 넘을 수 없습니다.`);
      }
      const row = { session_id: c.session_id, class_id: c.class_id, student_id: sid, [f]: v, updated_by: me.email };
      const [r] = await tx`insert into class.records ${tx(row)}
                           on conflict (session_id, class_id, student_id) do update
                           set ${tx({ [f]: v, updated_by: me.email })}, ver = class.records.ver + 1, updated_at = now()
                           returning ver`;
      return { ok: true, ver: r.ver, value: v };
    },
  }),

  /** 아직 출결을 안 넣은 학생을 모두 '출석'으로 */
  defineAction({
    name: "recordsAllPresent", who: { area: "scores_weekly", need: "editor" },
    run: async ({ tx, ws, body, me }) => {
      const c = await cellOf(tx, ws, body.session_id, body.class_id);
      await tx`insert into class.records (session_id, class_id, student_id, att, updated_by)
               select ${c.session_id}, ${c.class_id}, e.student_id, '출석', ${me.email} from class.enrollments e
               where e.course_id = ${c.course_id} and e.class_id = ${c.class_id} and e.status = 'active'
               on conflict (session_id, class_id, student_id) do update set att = '출석', ver = class.records.ver + 1, updated_at = now(), updated_by = ${me.email}
               where class.records.att is null`;
      return await sheet(tx, c);
    },
  }),

  /** 모의고사 회차 칸의 만점 */
  defineAction({
    name: "cellMockMax", who: { area: "scores_weekly", need: "editor" },
    run: async ({ tx, ws, body, me }) => {
      const c = await cellOf(tx, ws, body.session_id, body.class_id);
      const mx = body.mock_max == null || body.mock_max === "" ? null : Number(body.mock_max);
      if (mx != null && (!Number.isFinite(mx) || mx <= 0 || mx > 1000)) fail("만점이 올바르지 않습니다.");
      await tx`update class.session_cells set mock_max = ${mx} where session_id = ${c.session_id} and class_id = ${c.class_id}`;
      await log(tx, me.email, "모의 만점", { session_id: c.session_id, class_id: c.class_id, mock_max: mx }, ws, "scores_weekly");
      return await sheet(tx, c);
    },
  }),

  /** 입력 현황: 학기의 수업 칸마다 수강생 수 · 입력한 학생 수 */
  defineAction({
    name: "weeklyStatus", who: { area: "scores_weekly", need: "viewer" },
    run: async ({ tx, ws, body }) => {
      const t = await termOf(tx, ws, body.term_id);
      const rows = await tx`
        select sc.session_id::int as session_id, sc.class_id::int as class_id,
               (select count(*)::int from class.enrollments e where e.course_id = ${t.course_id} and e.class_id = sc.class_id and e.status = 'active') as total,
               (select count(*)::int from class.records r where r.session_id = sc.session_id and r.class_id = sc.class_id
                  and (r.att is not null or r.book is not null or r.beh is not null or r.nt is not null or r.hw is not null
                       or r.act is not null or r.test is not null or r.mock is not null)) as filled
        from class.session_cells sc join class.sessions s on s.id = sc.session_id
        where s.term_id = ${t.id} and s.kind = 'class'`;
      return { ok: true, rows };
    },
  }),

  defineAction({
    name: "rulesGet", who: { area: "scores_weekly", need: "viewer" },
    run: async ({ tx, ws, body }) => ({ ok: true, rules: await rules(tx, await courseOf(tx, ws, body.course_id)) }),
  }),

  defineAction({
    name: "rulesSave", who: { area: "scores_weekly", need: "admin" },
    run: async ({ tx, ws, body, me }) => {
      const cid = await courseOf(tx, ws, body.course_id);
      const pick = (src: unknown, keys: string[], max: number) => {
        const o = (src ?? {}) as Record<string, unknown>, out: Record<string, number> = {};
        for (const k of keys) { const n = Number(o[k]); if (!Number.isFinite(n) || n < 0 || n > max) fail("설정 값이 올바르지 않습니다."); out[k] = n; }
        return out;
      };
      const weights = pick(body.weights, Object.keys(DEF.weights), 100);
      if (Object.values(weights).reduce((a, b) => a + b, 0) <= 0) fail("가중치 합이 0 입니다.");
      const v = {
        course_id: cid, weights: tx.json(weights), hw_scale: tx.json(pick(body.hw_scale, ["A", "B", "C", "D"], 100)),
        note_penalty: pick({ p: body.note_penalty }, ["p"], 20).p, alert: tx.json(pick(body.alert, ["drop", "gap", "rep", "days"], 100)), updated_by: me.email,
      };
      await tx`insert into class.rules ${tx(v)} on conflict (course_id) do update set weights = excluded.weights, hw_scale = excluded.hw_scale,
               note_penalty = excluded.note_penalty, alert = excluded.alert, updated_by = excluded.updated_by, updated_at = now()`;
      await log(tx, me.email, "평가 규칙 저장", { course_id: cid, weights }, ws, "scores_weekly");
      return { ok: true, rules: await rules(tx, cid) };
    },
  }),
];
