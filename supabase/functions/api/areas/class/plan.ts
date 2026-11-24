// 수업: 진도(주차 × 과목 × 반)와 업무 일정
import { log } from "../../lib/audit.ts";
import { defineAction } from "../../lib/registry.ts";
import { refsOf, sameVer, termOf, ymdDate } from "../../lib/scope.ts";
import { fail, str } from "../../lib/util.ts";
import { termData } from "./timetable.ts";

export default [
  /** 주차 추가·이름 바꾸기·삭제(삭제하면 그 주 진도도 지움) */
  defineAction({
    name: "weekSave", who: { area: "class", need: "editor" },
    run: async ({ tx, ws, body, me }) => {
      const t = await termOf(tx, ws, body.term_id);
      const cat = str(body.category, 4);
      if (!["수학", "과학"].includes(cat)) fail("수학·과학 중 하나를 고르세요.");
      if (body.remove === true) {
        const [r] = await tx`delete from class.weeks where id = ${Number(body.id)} and term_id = ${t.id} returning no`;
        if (!r) fail("없는 주차입니다.", 404, "not_found");
        await log(tx, me.email, "진도 주차 삭제", { term_id: t.id, category: cat, no: r.no }, ws, "class");
        return await termData(tx, t.id);
      }
      const label = str(body.label, 30);
      try {
        if (body.id) {
          const [r] = await tx`update class.weeks set label = ${label} where id = ${Number(body.id)} and term_id = ${t.id} returning id`;
          if (!r) fail("없는 주차입니다.", 404, "not_found");
        } else {
          const [m] = await tx`select coalesce(max(no), 0) + 1 as n from class.weeks where term_id = ${t.id} and category = ${cat}`;
          const no = body.no ? Number(body.no) : Number(m.n);
          if (!Number.isInteger(no) || no < 0 || no > 200) fail("주차 번호가 올바르지 않습니다.");
          await tx`insert into class.weeks (term_id, category, no, label) values (${t.id}, ${cat}, ${no}, ${label || no + "주차"})`;
        }
      } catch (e) {
        if ((e as { code?: string }).code === "23505") fail("같은 주차가 이미 있습니다.");
        throw e;
      }
      await log(tx, me.email, "진도 주차 저장", { term_id: t.id, category: cat, label }, ws, "class");
      return await termData(tx, t.id);
    },
  }),

  /** 진도 칸 하나 저장(칸을 벗어나면 자동 저장). 새 칸은 ver 0. */
  defineAction({
    name: "currSave", who: { area: "class", need: "editor" },
    run: async ({ tx, ws, body, me }) => {
      const [w] = await tx`select w.id::int as id, w.term_id::int as term_id from class.weeks w where w.id = ${Number(body.week_id)}`;
      if (!w) fail("없는 주차입니다.", 404, "not_found");
      const t = await termOf(tx, ws, w.term_id);
      const r = await refsOf(tx, ws, t.course_id, body);
      if (r.class_id == null || r.subject_id == null) fail("반과 과목이 필요합니다.");
      const content = str(body.content, 1000);
      const important = body.important === true;
      const [cur] = await tx`select ver from class.curriculum where week_id = ${w.id} and subject_id = ${r.subject_id} and class_id = ${r.class_id}`;
      if (cur) {
        sameVer(cur.ver, body.ver);
        const [x] = await tx`update class.curriculum set content = ${content}, important = ${important}, ver = ver + 1, updated_at = now(), updated_by = ${me.email}
                             where week_id = ${w.id} and subject_id = ${r.subject_id} and class_id = ${r.class_id} returning ver`;
        await log(tx, me.email, "진도 저장", { term_id: t.id, week_id: w.id, subject_id: r.subject_id, class_id: r.class_id }, ws, "class");
        return { ok: true, ver: x.ver };
      }
      if (Number(body.ver ?? 0) !== 0) fail("다른 사람이 먼저 고쳤습니다. 새로 불러온 뒤 다시 하세요.", 409, "conflict");
      await tx`insert into class.curriculum (week_id, subject_id, class_id, content, important, updated_by)
               values (${w.id}, ${r.subject_id}, ${r.class_id}, ${content}, ${important}, ${me.email})`;
      await log(tx, me.email, "진도 저장", { term_id: t.id, week_id: w.id, subject_id: r.subject_id, class_id: r.class_id }, ws, "class");
      return { ok: true, ver: 1 };
    },
  }),

  /** 업무 일정 한 줄 저장·삭제(상태 진행 중/완료 포함) */
  defineAction({
    name: "eventSave", who: { area: "class", need: "editor" },
    run: async ({ tx, ws, body, me }) => {
      const t = await termOf(tx, ws, body.term_id);
      if (body.remove === true) {
        const [r] = await tx`delete from calendar.events where id = ${Number(body.id)} and term_id = ${t.id} returning id`;
        if (!r) fail("없는 일정입니다.", 404, "not_found");
        await log(tx, me.email, "업무 일정 삭제", { term_id: t.id, id: r.id }, ws, "class");
        return await termData(tx, t.id);
      }
      const v = {
        on_date: ymdDate(body.on_date), title: str(body.title, 500), status: body.status === "done" ? "done" : "todo",
        note: str(body.note, 500), important: body.important === true, updated_by: me.email,
      };
      if (body.id) {
        const [e] = await tx`select ver from calendar.events where id = ${Number(body.id)} and term_id = ${t.id}`;
        if (!e) fail("없는 일정입니다.", 404, "not_found");
        sameVer(e.ver, body.ver);
        await tx`update calendar.events set ${tx(v)}, ver = ver + 1, updated_at = now() where id = ${Number(body.id)}`;
      } else {
        await tx`insert into calendar.events ${tx({ ...v, workspace_id: ws, course_id: t.course_id, term_id: t.id, created_by: me.email })}`;
      }
      await log(tx, me.email, "업무 일정 저장", { term_id: t.id, on_date: v.on_date }, ws, "class");
      return await termData(tx, t.id);
    },
  }),
];
