// 수업: 수강생(과정 × 학생) — 반 배정, 반편성 점수(대수·기하·조합 → 총점 자동)
import type { Tx } from "../../lib/db.ts";
import { log } from "../../lib/audit.ts";
import { defineAction } from "../../lib/registry.ts";
import { courseOf, refsOf, sameVer } from "../../lib/scope.ts";
import { fail, str } from "../../lib/util.ts";

export const SCORE_KEYS = ["alg", "geo", "com"] as const;

async function roster(tx: Tx, courseId: number) {
  const rows = await tx`
    select e.student_id, e.class_id::int as class_id, e.scores, e.note, e.status, e.ver,
           s.name, s.name_no, s.center_id::int as center_id, s.school_name, s.entry_year
    from class.enrollments e join people.students s on s.id = e.student_id
    where e.course_id = ${courseId} order by s.name, s.name_no`;
  return { ok: true, rows };
}

function scores(raw: unknown): Record<string, number | null> {
  const src = (raw ?? {}) as Record<string, unknown>;
  const out: Record<string, number | null> = {};
  let sum = 0, any = false;
  for (const k of SCORE_KEYS) {
    const v = src[k] == null || src[k] === "" ? null : Number(src[k]);
    if (v != null && (!Number.isFinite(v) || v < 0 || v > 1000)) fail("점수가 올바르지 않습니다.");
    out[k] = v;
    if (v != null) { sum += v; any = true; }
  }
  out.total = any ? Math.round(sum * 10) / 10 : null;
  return out;
}

export default [
  defineAction({
    name: "rosterList", who: { area: "class", need: "viewer" },
    run: async ({ tx, ws, body }) => await roster(tx, await courseOf(tx, ws, body.course_id)),
  }),

  /** 아직 이 과정에 없는 학생(명부에서 골라 넣기) */
  defineAction({
    name: "rosterCandidates", who: { area: "class", need: "editor" },
    run: async ({ tx, ws, body }) => {
      const cid = await courseOf(tx, ws, body.course_id);
      const q = str(body.q, 40);
      const rows = await tx`select id, name, name_no, center_id::int as center_id, school_name from people.students s
                            where workspace_id = ${ws} and status = 'active' and (${q} = '' or name like ${"%" + q + "%"} or school_name like ${"%" + q + "%"})
                              and not exists (select 1 from class.enrollments e where e.course_id = ${cid} and e.student_id = s.id)
                            order by name limit 100`;
      return { ok: true, rows };
    },
  }),

  defineAction({
    name: "rosterAdd", who: { area: "class", need: "editor" },
    run: async ({ tx, ws, body, me }) => {
      const cid = await courseOf(tx, ws, body.course_id);
      const ids = (Array.isArray(body.student_ids) ? body.student_ids : []).map((x) => str(x, 40)).slice(0, 200);
      if (!ids.length) fail("학생을 고르세요.");
      const ok = await tx`select id from people.students where id = any(${ids}) and workspace_id = ${ws}`;
      if (ok.length !== ids.length) fail("이 작업공간의 학생이 아닌 것이 있습니다.");
      await tx`insert into class.enrollments (course_id, student_id, updated_by)
               select ${cid}, unnest(${ids}::uuid[]), ${me.email} on conflict do nothing`;
      await log(tx, me.email, "수강생 추가", { course_id: cid, count: ids.length }, ws, "class");
      return await roster(tx, cid);
    },
  }),

  /** 한 학생 저장: 반·점수·메모·상태. 총점은 서버가 계산. */
  defineAction({
    name: "rosterSave", who: { area: "class", need: "editor" },
    run: async ({ tx, ws, body, me }) => {
      const cid = await courseOf(tx, ws, body.course_id);
      const sid = str(body.student_id, 40);
      const [e] = await tx`select ver from class.enrollments where course_id = ${cid} and student_id = ${sid}`;
      if (!e) fail("이 과정의 수강생이 아닙니다.", 404, "not_found");
      sameVer(e.ver, body.ver);
      const r = await refsOf(tx, ws, cid, { class_id: body.class_id });
      const v = { class_id: r.class_id, scores: scores(body.scores), note: str(body.note, 500), status: body.status === "left" ? "left" : "active" };
      const [x] = await tx`update class.enrollments set class_id = ${v.class_id}, scores = ${tx.json(v.scores)}, note = ${v.note}, status = ${v.status},
                                  ver = ver + 1, updated_at = now(), updated_by = ${me.email}
                           where course_id = ${cid} and student_id = ${sid} returning ver`;
      await log(tx, me.email, "수강생 저장", { course_id: cid, student_id: sid }, ws, "class");
      return { ok: true, ver: x.ver, scores: v.scores };
    },
  }),
];
