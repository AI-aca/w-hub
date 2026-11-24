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

const DEF = { mock_default: {} as Record<string, number>, cat_weights: { 수학: 60, 과학: 40 }, weights: { att: 5, book: 5, beh: 5, act: 5, hw: 10, test: 20, mock: 50 }, hw_scale: { A: 100, B: 60, C: 20, D: 0 }, note_penalty: 2, alert: { drop: 15, gap: 20, rep: 2, days: 7 } };
export async function rules(tx: Tx, courseId: number) {
  const [r] = await tx`select weights, hw_scale, note_penalty::float as note_penalty, alert, mock_default, cat_weights, updated_at, updated_by from class.rules where course_id = ${courseId}`;
  return r ?? { ...DEF, updated_at: null, updated_by: "" };
}

/** 과목별 기본 만점 검사: 이 과정 과목만, 0 < 값 ≤ 1000, 빈 값은 뺀다 */
async function mockDefaults(tx: Tx, courseId: number, raw: unknown): Promise<Record<string, number>> {
  const src = (raw ?? {}) as Record<string, unknown>;
  const subs = new Set((await tx`select id::text as id from class.subjects where course_id = ${courseId}`).map((x) => String(x.id)));
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(src)) {
    if (v == null || v === "") continue;
    if (!subs.has(k)) fail("이 과정의 과목이 아닙니다.");
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0 || n > 1000) fail("기본 만점이 올바르지 않습니다.");
    out[k] = n;
  }
  return out;
}

/** 모의 만점 = 회차×과목 값, 없으면 과정 설정의 과목 기본 만점(둘 다 없으면 null) */
async function maxOf(tx: Tx, sessionId: number, subjectId: number | null, courseId: number): Promise<number | null> {
  if (subjectId == null) return null;
  const [r] = await tx`select coalesce(
      (select m.max_score::float from class.mock_max m where m.session_id = ${sessionId} and m.subject_id = ${subjectId}),
      (select (x.mock_default ->> ${String(subjectId)})::float from class.rules x where x.course_id = ${courseId})) as mx`;
  return r?.mx ?? null;
}

async function mockMaxRows(tx: Tx, termId: number) {
  return await tx`select s.id::int as session_id, s.on_date::text as on_date, s.start_t, s.week_label, b.id::int as subject_id, b.name as subject,
                         b.category, (select m.max_score::float from class.mock_max m where m.session_id = s.id and m.subject_id = b.id) as max_score,
                         (select (x.mock_default ->> b.id::text)::float from class.rules x where x.course_id = b.course_id) as default_max
                  from class.sessions s join class.session_cells c on c.session_id = s.id join class.subjects b on b.id = c.subject_id
                  where s.term_id = ${termId} and s.mock group by s.id, b.id order by s.on_date, s.start_t, b.sort, b.id`;
}

async function sheet(tx: Tx, c: { session_id: number; class_id: number; course_id: number }) {
  const [info] = await tx`select s.on_date::text as on_date, s.start_t, s.end_t, s.week_label, s.mock, sc.subject_id::int as subject_id,
                                 sb.name as subject, sb.category, f.name as staff, f.email as staff_email, k.name as class_name
                          from class.sessions s join class.session_cells sc on sc.session_id = s.id and sc.class_id = ${c.class_id}
                          join class.classes k on k.id = sc.class_id left join class.subjects sb on sb.id = sc.subject_id
                          left join org.staff f on f.id = sc.staff_id where s.id = ${c.session_id}`;
  const students = await tx`select e.student_id, s.name, s.name_no from class.enrollments e join people.students s on s.id = e.student_id
                            where e.course_id = ${c.course_id} and e.class_id = ${c.class_id} and e.status = 'active' order by s.name, s.name_no`;
  const records = await tx`select student_id, att, book, beh, nt, hw, act, test::float as test, mock::float as mock, ver, updated_by
                           from class.records where session_id = ${c.session_id} and class_id = ${c.class_id}`;
  info.mock_max = info.mock ? await maxOf(tx, c.session_id, info.subject_id, c.course_id) : null;
  return { ok: true, info, students, records };
}

/** 칸 값 하나를 검사해서 넣는다(입력표·붙여넣기 공용). 모의 원점수는 모의 회차에서만, 만점을 넘지 못함. */
async function putRecord(tx: Tx, c: { session_id: number; class_id: number; course_id: number }, sid: string, f: Field, raw: unknown, by: string, mx: { mock: boolean; max: number | null }) {
  const v = clean(f, raw);
  if (f === "mock" && v != null) {
    if (!mx.mock) fail("모의고사 회차가 아닙니다.");
    if (mx.max != null && Number(v) > mx.max) fail(`만점(${mx.max})을 넘을 수 없습니다.`);
  }
  const row = { session_id: c.session_id, class_id: c.class_id, student_id: sid, [f]: v, updated_by: by };
  const [r] = await tx`insert into class.records ${tx(row)}
                       on conflict (session_id, class_id, student_id) do update
                       set ${tx({ [f]: v, updated_by: by })}, ver = class.records.ver + 1, updated_at = now()
                       returning ver`;
  return { ver: r.ver as number, value: v };
}

async function mockInfo(tx: Tx, c: { session_id: number; class_id: number; course_id: number }) {
  const [m] = await tx`select s.mock, sc.subject_id::int as subject_id from class.sessions s join class.session_cells sc on sc.session_id = s.id
                       where s.id = ${c.session_id} and sc.class_id = ${c.class_id}`;
  return { mock: m.mock as boolean, max: m.mock ? await maxOf(tx, c.session_id, m.subject_id, c.course_id) : null };
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
      const sid = str(body.student_id, 40);
      if (!(await tx`select 1 from class.enrollments where course_id = ${c.course_id} and student_id = ${sid}`).length) fail("이 과정의 수강생이 아닙니다.");
      const r = await putRecord(tx, c, sid, f, body.value, me.email, await mockInfo(tx, c));
      return { ok: true, ver: r.ver, value: r.value };
    },
  }),

  /** 엑셀에서 붙여넣기: 한 항목을 여러 학생에게 한꺼번에. 하나라도 틀리면 아무것도 넣지 않는다. */
  defineAction({
    name: "recordsPaste", who: { area: "scores_weekly", need: "editor" },
    run: async ({ tx, ws, body, me }) => {
      const c = await cellOf(tx, ws, body.session_id, body.class_id);
      const f = str(body.field, 10) as Field;
      if (!FIELDS.includes(f) || f === "book") fail("붙여넣을 수 없는 항목입니다.");
      const rows = (Array.isArray(body.rows) ? body.rows : []).slice(0, 200) as { student_id?: unknown; value?: unknown }[];
      if (!rows.length) fail("넣을 값이 없습니다.");
      const ok = new Set((await tx`select e.student_id from class.enrollments e where e.course_id = ${c.course_id} and e.class_id = ${c.class_id} and e.status = 'active'`).map((x) => String(x.student_id)));
      const mi = await mockInfo(tx, c);
      for (const r of rows) {
        const sid = str(r.student_id, 40);
        if (!ok.has(sid)) fail("이 반 수강생이 아닌 학생이 있습니다.");
        await putRecord(tx, c, sid, f, r.value, me.email, mi);
      }
      await log(tx, me.email, "성적 붙여넣기", { session_id: c.session_id, class_id: c.class_id, field: f, count: rows.length }, ws, "scores_weekly");
      return await sheet(tx, c);
    },
  }),

  /** 모의고사 만점 목록: 학기의 모의 회차 × 그 회차에 들어 있는 과목 */
  defineAction({
    name: "mockMaxList", who: { area: "scores_weekly", need: "viewer" },
    run: async ({ tx, ws, body }) => ({ ok: true, rows: await mockMaxRows(tx, (await termOf(tx, ws, body.term_id)).id) }),
  }),

  /** 모의고사 만점 저장(관리 권한). 빈 값이면 지운다. */
  defineAction({
    name: "mockMaxSave", who: { area: "scores_weekly", need: "admin" },
    run: async ({ tx, ws, body, me }) => {
      const t = await termOf(tx, ws, body.term_id);
      const sid = Number(body.session_id), sub = Number(body.subject_id);
      const [ok] = await tx`select 1 from class.sessions s join class.session_cells c on c.session_id = s.id
                            where s.id = ${sid} and s.term_id = ${t.id} and s.mock and c.subject_id = ${sub} limit 1`;
      if (!ok) fail("이 학기의 모의고사 회차·과목이 아닙니다.");
      const mx = body.max_score == null || body.max_score === "" ? null : Number(body.max_score);
      if (mx == null) await tx`delete from class.mock_max where session_id = ${sid} and subject_id = ${sub}`;
      else {
        if (!Number.isFinite(mx) || mx <= 0 || mx > 1000) fail("만점이 올바르지 않습니다.");
        const [over] = await tx`select 1 from class.records r join class.session_cells c on c.session_id = r.session_id and c.class_id = r.class_id
                                where r.session_id = ${sid} and c.subject_id = ${sub} and r.mock > ${mx} limit 1`;
        if (over) fail(`이미 입력된 원점수 중 ${mx}점보다 큰 것이 있습니다.`);
        await tx`insert into class.mock_max (session_id, subject_id, max_score, updated_by) values (${sid}, ${sub}, ${mx}, ${me.email})
                 on conflict (session_id, subject_id) do update set max_score = excluded.max_score, updated_by = excluded.updated_by, updated_at = now()`;
      }
      await log(tx, me.email, "모의 만점", { session_id: sid, subject_id: sub, max_score: mx }, ws, "scores_weekly");
      return { ok: true, rows: await mockMaxRows(tx, t.id) };
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
      const cw = pick(body.cat_weights ?? DEF.cat_weights, ["수학", "과학"], 100);
      if (cw["수학"] + cw["과학"] <= 0) fail("수학·과학 비율 합이 0 입니다.");
      const v = {
        course_id: cid, weights: tx.json(weights), hw_scale: tx.json(pick(body.hw_scale, ["A", "B", "C", "D"], 100)),
        note_penalty: pick({ p: body.note_penalty }, ["p"], 20).p, alert: tx.json(pick(body.alert, ["drop", "gap", "rep", "days"], 100)),
        mock_default: tx.json(await mockDefaults(tx, cid, body.mock_default)), updated_by: me.email,
        cat_weights: tx.json(cw),
      };
      await tx`insert into class.rules ${tx(v)} on conflict (course_id) do update set weights = excluded.weights, hw_scale = excluded.hw_scale,
               note_penalty = excluded.note_penalty, alert = excluded.alert, mock_default = excluded.mock_default, cat_weights = excluded.cat_weights, updated_by = excluded.updated_by, updated_at = now()`;
      await log(tx, me.email, "평가 규칙 저장", { course_id: cid, weights }, ws, "scores_weekly");
      return { ok: true, rules: await rules(tx, cid) };
    },
  }),
];
