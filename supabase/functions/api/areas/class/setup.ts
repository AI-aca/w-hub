// 수업: 과정·학기·과목·반(설정). 읽기는 열람 이상, 고치기는 관리 이상. 강사 명부는 관리 메뉴(staffSave, 원장)에서.
import type { Tx } from "../../lib/db.ts";
import { log } from "../../lib/audit.ts";
import { defineAction } from "../../lib/registry.ts";
import { courseOf, ymdDate } from "../../lib/scope.ts";
import { fail, str } from "../../lib/util.ts";

const CATS = ["수학", "과학", "기타"];

async function meta(tx: Tx, ws: string) {
  const courses = await tx`select id::int as id, name, sort, active from class.courses where workspace_id = ${ws} order by sort, id`;
  const ids = courses.map((c) => c.id);
  const terms = await tx`select id::int as id, course_id::int as course_id, name, starts_on::text as starts_on, ends_on::text as ends_on, sort
                         from class.terms where course_id = any(${ids}) order by sort, id`;
  const subjects = await tx`select id::int as id, course_id::int as course_id, name, category, emoji, sort, active
                            from class.subjects where course_id = any(${ids}) order by sort, id`;
  const classes = await tx`select id::int as id, course_id::int as course_id, name, sort, active
                           from class.classes where course_id = any(${ids}) order by sort, id`;
  const staff = await tx`select id, name, email, phone, subjects, memo, active from org.staff where workspace_id = ${ws} order by active desc, name`;
  return { ok: true, courses, terms, subjects, classes, staff };
}

/** 지우기: 쓰인 곳이 있으면 숨기기(active=false), 없으면 삭제 */
async function removeOrHide(tx: Tx, kind: "subject" | "class", id: number): Promise<"hidden" | "deleted"> {
  const used = kind === "subject"
    ? (await tx`select 1 from class.curriculum where subject_id = ${id} union all select 1 from class.session_cells where subject_id = ${id}
                union all select 1 from class.slot_cells where subject_id = ${id} limit 1`).length
    : (await tx`select 1 from class.curriculum where class_id = ${id} union all select 1 from class.session_cells where class_id = ${id}
                union all select 1 from class.enrollments where class_id = ${id} limit 1`).length;
  if (used) {
    if (kind === "subject") await tx`update class.subjects set active = false where id = ${id}`;
    else await tx`update class.classes set active = false where id = ${id}`;
    return "hidden";
  }
  if (kind === "subject") await tx`delete from class.subjects where id = ${id}`;
  else await tx`delete from class.classes where id = ${id}`;
  return "deleted";
}

export default [
  defineAction({
    name: "classMeta", who: { area: ["class", "scores_weekly"], need: "viewer" },
    run: async ({ tx, ws }) => await meta(tx, ws),
  }),

  /** 과정·학기·과목·반 하나를 만들거나 고치거나 지운다. kind 로 구분. */
  defineAction({
    name: "classSetup", who: { area: "class", need: "admin" },
    run: async ({ tx, ws, body, me }) => {
      const kind = str(body.kind, 10);
      const id = body.id == null || body.id === "" ? null : Number(body.id);
      const remove = body.remove === true;
      const name = str(body.name, 60);
      const sort = Number(body.sort ?? 0) || 0;
      const active = body.active !== false;
      if (!remove && !name) fail("이름을 입력하세요.");
      try {
        if (kind === "course") {
          if (remove) fail("과정은 지우지 않습니다. 숨기기를 쓰세요.");
          if (id) await tx`update class.courses set name = ${name}, sort = ${sort}, active = ${active} where id = ${await courseOf(tx, ws, id)}`;
          else await tx`insert into class.courses (workspace_id, name, sort) values (${ws}, ${name}, ${sort})`;
        } else if (kind === "term") {
          const cid = await courseOf(tx, ws, body.course_id);
          const s = body.starts_on ? ymdDate(body.starts_on) : null, e = body.ends_on ? ymdDate(body.ends_on) : null;
          if (remove) {
            if (!id) fail("학기를 고르세요.");
            const [n] = await tx`select (select count(*) from class.sessions where term_id = ${id}) + (select count(*) from class.weeks where term_id = ${id}) as n`;
            if (Number(n.n) > 0) fail("시간표·진도가 있는 학기는 지울 수 없습니다.");
            await tx`delete from class.terms where id = ${id} and course_id = ${cid}`;
          } else if (id) await tx`update class.terms set name = ${name}, starts_on = ${s}, ends_on = ${e}, sort = ${sort} where id = ${id} and course_id = ${cid}`;
          else await tx`insert into class.terms (course_id, name, starts_on, ends_on, sort) values (${cid}, ${name}, ${s}, ${e}, ${sort})`;
        } else if (kind === "subject" || kind === "class") {
          const cid = await courseOf(tx, ws, body.course_id);
          const own = kind === "subject"
            ? await tx`select 1 from class.subjects where id = ${id} and course_id = ${cid}`
            : await tx`select 1 from class.classes where id = ${id} and course_id = ${cid}`;
          if ((id || remove) && !own.length) fail("없는 항목입니다.", 404, "not_found");
          if (remove) {
            const r = await removeOrHide(tx, kind, id!);
            await log(tx, me.email, kind === "subject" ? "과목 지움" : "반 지움", { id, result: r }, ws, "class");
            return { ...(await meta(tx, ws)), result: r };
          }
          if (kind === "subject") {
            const cat = str(body.category, 4);
            if (!CATS.includes(cat)) fail("과목 구분은 수학·과학·기타 중 하나입니다.");
            const emoji = str(body.emoji, 4);
            if (id) await tx`update class.subjects set name = ${name}, category = ${cat}, emoji = ${emoji}, sort = ${sort}, active = ${active} where id = ${id}`;
            else await tx`insert into class.subjects (course_id, name, category, emoji, sort) values (${cid}, ${name}, ${cat}, ${emoji}, ${sort})`;
          } else if (id) await tx`update class.classes set name = ${name}, sort = ${sort}, active = ${active} where id = ${id}`;
          else await tx`insert into class.classes (course_id, name, sort) values (${cid}, ${name}, ${sort})`;
        } else fail("알 수 없는 설정입니다.");
      } catch (e) {
        if ((e as { code?: string }).code === "23505") fail("같은 이름이 이미 있습니다.");
        throw e;
      }
      await log(tx, me.email, "수업 설정", { kind, id, name, remove }, ws, "class");
      return await meta(tx, ws);
    },
  }),

];
