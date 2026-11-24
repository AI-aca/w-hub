// 수업: 학기 자료 한 번에 읽기 + 시간표(요약 = 요일 틀, 상세 = 날짜별 회차)
import type { Tx } from "../../lib/db.ts";
import { log } from "../../lib/audit.ts";
import { defineAction } from "../../lib/registry.ts";
import { hhmm, refsOf, sameVer, termOf, ymdDate } from "../../lib/scope.ts";
import { fail, str } from "../../lib/util.ts";

type Cell = { class_id: number; subject_id: number | null; staff_id: string | null; note: string };

async function cellsOf(tx: Tx, ws: string, courseId: number, raw: unknown): Promise<Cell[]> {
  if (!Array.isArray(raw)) return [];
  const out: Cell[] = [];
  for (const c of raw.slice(0, 40) as Record<string, unknown>[]) {
    const r = await refsOf(tx, ws, courseId, c);
    if (r.class_id == null) fail("반이 없는 칸이 있습니다.");
    if (out.some((x) => x.class_id === r.class_id)) fail("같은 반이 두 번 들어갔습니다.");
    out.push({ class_id: r.class_id!, subject_id: r.subject_id, staff_id: r.staff_id, note: str(c.note, 200) });
  }
  return out;
}

export async function termData(tx: Tx, termId: number) {
  const slots = await tx`select id::int as id, weekday, start_t, end_t, sort, ver from class.slots where term_id = ${termId} order by weekday = 0, weekday, start_t, sort, id`;
  const slotCells = await tx`select c.slot_id::int as slot_id, c.class_id::int as class_id, c.subject_id::int as subject_id, c.staff_id, c.note
                             from class.slot_cells c join class.slots s on s.id = c.slot_id where s.term_id = ${termId}`;
  const sessions = await tx`select id::int as id, on_date::text as on_date, start_t, end_t, kind, week_label, note, important, mock, ver
                            from class.sessions where term_id = ${termId} order by on_date, start_t, id`;
  const sessCells = await tx`select c.session_id::int as session_id, c.class_id::int as class_id, c.subject_id::int as subject_id, c.staff_id, c.note
                             from class.session_cells c join class.sessions s on s.id = c.session_id where s.term_id = ${termId}`;
  const weeks = await tx`select id::int as id, category, no, label from class.weeks where term_id = ${termId} order by category, no`;
  const curriculum = await tx`select c.week_id::int as week_id, c.subject_id::int as subject_id, c.class_id::int as class_id, c.content, c.important, c.ver,
                                     c.updated_at, c.updated_by
                              from class.curriculum c join class.weeks w on w.id = c.week_id where w.term_id = ${termId}`;
  const events = await tx`select id::int as id, on_date::text as on_date, title, status, note, important, ver from calendar.events
                          where term_id = ${termId} order by on_date, id`;
  return {
    ok: true,
    slots: slots.map((s) => ({ ...s, cells: slotCells.filter((c) => c.slot_id === s.id) })),
    sessions: sessions.map((s) => ({ ...s, cells: sessCells.filter((c) => c.session_id === s.id) })),
    weeks, curriculum, events,
  };
}

export default [
  defineAction({
    name: "classTerm", who: { area: ["class", "scores_weekly"], need: "viewer" },
    run: async ({ tx, ws, body }) => termData(tx, (await termOf(tx, ws, body.term_id)).id),
  }),

  /** 요약(요일 틀) 한 줄 저장: 요일·시간 + 반별 칸 */
  defineAction({
    name: "slotSave", who: { area: "class", need: "editor" },
    run: async ({ tx, ws, body, me }) => {
      const t = await termOf(tx, ws, body.term_id);
      const wd = Number(body.weekday);
      if (!Number.isInteger(wd) || wd < 0 || wd > 6) fail("요일을 고르세요.");
      const v = { weekday: wd, start_t: hhmm(body.start_t), end_t: hhmm(body.end_t) };
      const cells = await cellsOf(tx, ws, t.course_id, body.cells);
      let id = body.id ? Number(body.id) : 0;
      if (id) {
        const [s] = await tx`select ver from class.slots where id = ${id} and term_id = ${t.id}`;
        if (!s) fail("없는 시간대입니다.", 404, "not_found");
        sameVer(s.ver, body.ver);
        await tx`update class.slots set ${tx(v)}, ver = ver + 1 where id = ${id}`;
        await tx`delete from class.slot_cells where slot_id = ${id}`;
      } else {
        [{ id }] = await tx`insert into class.slots ${tx({ ...v, term_id: t.id })} returning id::int as id`;
      }
      for (const c of cells) await tx`insert into class.slot_cells ${tx({ ...c, slot_id: id })}`;
      await log(tx, me.email, "시간표 요약 저장", { term_id: t.id, slot_id: id }, ws, "class");
      return await termData(tx, t.id);
    },
  }),

  defineAction({
    name: "slotDelete", who: { area: "class", need: "editor" },
    run: async ({ tx, ws, body, me }) => {
      const t = await termOf(tx, ws, body.term_id);
      const [r] = await tx`delete from class.slots where id = ${Number(body.id)} and term_id = ${t.id} returning id`;
      if (!r) fail("없는 시간대입니다.", 404, "not_found");
      await log(tx, me.email, "시간표 요약 삭제", { term_id: t.id, slot_id: r.id }, ws, "class");
      return await termData(tx, t.id);
    },
  }),

  /** 상세(날짜별 회차) 저장. 휴강이면 칸 없이 메모만. */
  defineAction({
    name: "sessionSave", who: { area: "class", need: "editor" },
    run: async ({ tx, ws, body, me }) => {
      const t = await termOf(tx, ws, body.term_id);
      const kind = body.kind === "holiday" ? "holiday" : "class";
      const v = {
        on_date: ymdDate(body.on_date), start_t: hhmm(body.start_t), end_t: hhmm(body.end_t), kind,
        week_label: str(body.week_label, 30), note: str(body.note, 300), important: body.important === true, mock: kind === "class" && body.mock === true,
        updated_by: me.email,
      };
      const cells = kind === "holiday" ? [] : await cellsOf(tx, ws, t.course_id, body.cells);
      let id = body.id ? Number(body.id) : 0;
      if (id) {
        const [s] = await tx`select ver from class.sessions where id = ${id} and term_id = ${t.id}`;
        if (!s) fail("없는 회차입니다.", 404, "not_found");
        sameVer(s.ver, body.ver);
        // 성적이 입력된 반의 칸은 지우지 않는다(칸을 지우면 그 칸의 성적도 지워지므로 막는다).
        const keep = cells.map((c) => c.class_id);
        const [hit] = await tx`select k.name from class.records r join class.classes k on k.id = r.class_id
                               where r.session_id = ${id} and not (r.class_id = any(${keep})) limit 1`;
        if (hit) fail(`${hit.name} 칸에 입력된 성적이 있어 비우거나 휴강으로 바꿀 수 없습니다.`);
        await tx`update class.sessions set ${tx(v)}, ver = ver + 1, updated_at = now() where id = ${id}`;
        await tx`delete from class.session_cells where session_id = ${id} and not (class_id = any(${keep}))`;
      } else {
        [{ id }] = await tx`insert into class.sessions ${tx({ ...v, term_id: t.id })} returning id::int as id`;
      }
      for (const c of cells) {
        await tx`insert into class.session_cells ${tx({ ...c, session_id: id })}
                 on conflict (session_id, class_id) do update set subject_id = excluded.subject_id, staff_id = excluded.staff_id, note = excluded.note`;
      }
      await log(tx, me.email, kind === "holiday" ? "휴강 저장" : "시간표 상세 저장", { term_id: t.id, session_id: id, on_date: v.on_date }, ws, "class");
      return await termData(tx, t.id);
    },
  }),

  defineAction({
    name: "sessionDelete", who: { area: "class", need: "editor" },
    run: async ({ tx, ws, body, me }) => {
      const t = await termOf(tx, ws, body.term_id);
      if ((await tx`select 1 from class.records where session_id = ${Number(body.id)} limit 1`).length) fail("성적이 입력된 회차는 지울 수 없습니다. 성적을 먼저 지우세요.");
      const [r] = await tx`delete from class.sessions where id = ${Number(body.id)} and term_id = ${t.id} returning id, on_date::text as on_date`;
      if (!r) fail("없는 회차입니다.", 404, "not_found");
      await log(tx, me.email, "시간표 상세 삭제", { term_id: t.id, session_id: r.id, on_date: r.on_date }, ws, "class");
      return await termData(tx, t.id);
    },
  }),

  /** 주차 일괄 생성: 요약(요일 틀)을 요일별 날짜에 복사. dates = { "6": "2027-01-09", "0": "2027-01-10" } */
  defineAction({
    name: "sessionsFromSlots", who: { area: "class", need: "editor" },
    run: async ({ tx, ws, body, me }) => {
      const t = await termOf(tx, ws, body.term_id);
      const dates = (body.dates ?? {}) as Record<string, unknown>;
      const slots = await tx`select id::int as id, weekday, start_t, end_t from class.slots where term_id = ${t.id}`;
      if (!slots.length) fail("먼저 시간표 요약에 시간대를 하나 이상 넣으세요.");
      const days = [...new Set(slots.map((s) => String(s.weekday)))];
      for (const d of days) if (!dates[d]) fail("모든 요일의 날짜를 고르세요.");
      const label = str(body.week_label, 30);
      let n = 0;
      for (const s of slots) {
        const on = ymdDate(dates[String(s.weekday)]);
        if (new Date(on + "T00:00:00Z").getUTCDay() !== s.weekday) fail(`${on} 은(는) 요일이 맞지 않습니다.`);
        const [{ id }] = await tx`insert into class.sessions (term_id, on_date, start_t, end_t, week_label, updated_by)
                                  values (${t.id}, ${on}, ${s.start_t}, ${s.end_t}, ${label}, ${me.email}) returning id::int as id`;
        await tx`insert into class.session_cells (session_id, class_id, subject_id, staff_id, note)
                 select ${id}, class_id, subject_id, staff_id, note from class.slot_cells where slot_id = ${s.id}`;
        n++;
      }
      await log(tx, me.email, "주차 일괄 생성", { term_id: t.id, week_label: label, count: n }, ws, "class");
      return { ...(await termData(tx, t.id)), created: n };
    },
  }),
];
