// 학생 명부(작업공간별). 센터 범위가 있는 사람은 그 센터 학생만 본다.
import type { Tx } from "../../lib/db.ts";
import { log } from "../../lib/audit.ts";
import { defineAction } from "../../lib/registry.ts";
import { type AreaAccess, inCenters } from "../../lib/perm.ts";
import { fail, str } from "../../lib/util.ts";

const COLS = ["name", "name_no", "center_id", "school_name", "entry_year", "student_phone", "parent_phone", "memo"] as const;
const KO: Record<string, string> = {
  name: "이름", name_no: "동명 번호", center_id: "센터", school_name: "학교", entry_year: "입학년도",
  student_phone: "학생 연락처", parent_phone: "학부모 연락처", memo: "메모",
};

async function loadOne(tx: Tx, ws: string, id: string, a: AreaAccess) {
  const [s] = await tx`select id, name, name_no, center_id::int as center_id, school_name, entry_year, student_phone, parent_phone,
                              memo, status, ver, created_at, created_by, updated_at, updated_by
                       from people.students where id = ${id} and workspace_id = ${ws}`;
  if (!s) fail("없는 학생입니다.", 404, "not_found");
  if (!inCenters(a, s.center_id)) fail("담당 센터의 학생이 아닙니다.", 403, "forbidden");
  return s;
}

function clean(b: Record<string, unknown>) {
  const name = str(b.name, 40);
  if (!name) fail("이름을 입력하세요.");
  const no = Number(b.name_no ?? 0);
  if (!Number.isInteger(no) || no < 0 || no > 99) fail("동명 번호는 0~99 입니다.");
  const ey = b.entry_year == null || b.entry_year === "" ? null : Number(b.entry_year);
  if (ey != null && (!Number.isInteger(ey) || ey < 2000 || ey > 2100)) fail("입학년도가 올바르지 않습니다.");
  return {
    name, name_no: no,
    center_id: b.center_id == null || b.center_id === "" ? null : Number(b.center_id),
    school_name: str(b.school_name, 40), entry_year: ey,
    student_phone: str(b.student_phone, 30), parent_phone: str(b.parent_phone, 30), memo: str(b.memo, 2000),
  };
}

export default [
  defineAction({
    name: "studentList", who: { area: "students", need: "viewer" },
    run: async ({ tx, ws, access, body }) => {
      const all = body.include_archived === true;
      const cids = access!.center_ids;
      const rows = await tx`
        select id, name, name_no, center_id::int as center_id, school_name, entry_year, status, updated_at
        from people.students
        where workspace_id = ${ws} and (${all} or status = 'active')
          and (${cids === null} or center_id = any(${cids ?? []}))
        order by name, name_no limit 5000`;
      return { ok: true, rows };
    },
  }),

  defineAction({
    name: "studentGet", who: { area: "students", need: "viewer" },
    run: async ({ tx, ws, access, body }) => {
      const s = await loadOne(tx, ws, str(body.id, 40), access!);
      const aliases = await tx`select source, source_key from people.student_aliases where student_id = ${s.id} order by source`;
      const history = await tx`select at, email, action, detail from core.audit_log
                               where workspace_id = ${ws} and area = 'students' and detail->>'id' = ${s.id} order by at desc limit 50`;
      return { ok: true, student: s, aliases, history };
    },
  }),

  /** 저장. ver 로 동시 수정을 막는다(다른 사람이 먼저 바꿨으면 다시 불러오라고 알림). */
  defineAction({
    name: "studentSave", who: { area: "students", need: "editor" },
    run: async ({ tx, ws, access, body, me }) => {
      const v = clean(body);
      if (v.center_id != null) {
        const [c] = await tx`select id from org.centers where id = ${v.center_id} and workspace_id = ${ws}`;
        if (!c) fail("작업공간에 없는 센터입니다.");
      }
      if (!inCenters(access!, v.center_id)) fail("담당 센터에만 학생을 둘 수 있습니다.", 403, "forbidden");
      try {
        if (body.id) {
          const before = await loadOne(tx, ws, str(body.id, 40), access!);
          if (Number(body.ver) !== before.ver) fail("다른 사람이 먼저 고쳤습니다. 새로 불러온 뒤 다시 저장하세요.", 409, "conflict");
          const changes: Record<string, [unknown, unknown]> = {};
          for (const k of COLS) if (String(before[k] ?? "") !== String(v[k] ?? "")) changes[KO[k]] = [before[k], v[k]];
          if (!Object.keys(changes).length) return { ok: true, id: before.id, ver: before.ver };
          const [r] = await tx`update people.students set ${tx(v)}, ver = ver + 1, updated_at = now(), updated_by = ${me.email}
                               where id = ${before.id} returning id, ver`;
          await log(tx, me.email, "학생 변경", { id: r.id, name: v.name, changes }, ws, "students");
          return { ok: true, id: r.id, ver: r.ver };
        }
        const [r] = await tx`insert into people.students ${tx({ ...v, workspace_id: ws, created_by: me.email, updated_by: me.email })}
                             returning id, ver`;
        await log(tx, me.email, "학생 등록", { id: r.id, name: v.name }, ws, "students");
        return { ok: true, id: r.id, ver: r.ver };
      } catch (e) {
        if ((e as { code?: string }).code === "23505") fail("같은 이름·번호·센터·학교의 학생이 이미 있습니다. 동명이인이면 동명 번호를 바꾸세요.");
        throw e;
      }
    },
  }),

  /** 보관(삭제 대신). 성적·기록은 그대로 남는다. */
  defineAction({
    name: "studentArchive", who: { area: "students", need: "admin" },
    run: async ({ tx, ws, access, body, me }) => {
      const s = await loadOne(tx, ws, str(body.id, 40), access!);
      const archived = body.archived !== false;
      await tx`update people.students set status = ${archived ? "archived" : "active"}, ver = ver + 1, updated_at = now(), updated_by = ${me.email}
               where id = ${s.id}`;
      await log(tx, me.email, archived ? "학생 보관" : "학생 복원", { id: s.id, name: s.name }, ws, "students");
      return { ok: true };
    },
  }),
];
