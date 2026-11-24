// 작업공간 범위 확인과 입력값 검사(여러 영역이 같이 씀). 다른 작업공간의 id 를 넣어도 막힌다.
import type { Tx } from "./db.ts";
import { fail, str } from "./util.ts";

export async function courseOf(tx: Tx, ws: string, id: unknown): Promise<number> {
  const n = Number(id);
  if (!Number.isInteger(n)) fail("과정을 고르세요.");
  const [c] = await tx`select id from class.courses where id = ${n} and workspace_id = ${ws}`;
  if (!c) fail("없는 과정입니다.", 404, "not_found");
  return n;
}

/** 학기 → 과정 id (작업공간 확인 포함) */
export async function termOf(tx: Tx, ws: string, id: unknown): Promise<{ id: number; course_id: number }> {
  const n = Number(id);
  if (!Number.isInteger(n)) fail("학기를 고르세요.");
  const [t] = await tx`select t.id::int as id, t.course_id::int as course_id from class.terms t join class.courses c on c.id = t.course_id
                       where t.id = ${n} and c.workspace_id = ${ws}`;
  if (!t) fail("없는 학기입니다.", 404, "not_found");
  return t as { id: number; course_id: number };
}

/** 반·과목·강사가 이 과정(작업공간) 것인지 확인. 빈 값은 null. */
export async function refsOf(tx: Tx, ws: string, courseId: number, v: { class_id?: unknown; subject_id?: unknown; staff_id?: unknown }) {
  const cls = v.class_id == null || v.class_id === "" ? null : Number(v.class_id);
  const sub = v.subject_id == null || v.subject_id === "" ? null : Number(v.subject_id);
  const stf = v.staff_id == null || v.staff_id === "" ? null : str(v.staff_id, 40);
  if (cls != null && !(await tx`select 1 from class.classes where id = ${cls} and course_id = ${courseId}`).length) fail("이 과정의 반이 아닙니다.");
  if (sub != null && !(await tx`select 1 from class.subjects where id = ${sub} and course_id = ${courseId}`).length) fail("이 과정의 과목이 아닙니다.");
  if (stf != null && !(await tx`select 1 from org.staff where id = ${stf} and workspace_id = ${ws}`).length) fail("이 작업공간의 강사가 아닙니다.");
  return { class_id: cls, subject_id: sub, staff_id: stf };
}

export function hhmm(v: unknown): string {
  const s = str(v, 5);
  if (s && !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(s)) fail("시간은 00:00 형식으로 입력하세요.");
  return s;
}

export function ymdDate(v: unknown): string {
  const s = str(v, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s + "T00:00:00Z"))) fail("날짜가 올바르지 않습니다.");
  return s;
}

/** 동시 수정 검사: 화면이 가진 ver 와 DB ver 가 다르면 거절 */
export function sameVer(dbVer: number, sent: unknown): void {
  if (Number(sent) !== Number(dbVer)) fail("다른 사람이 먼저 고쳤습니다. 새로 불러온 뒤 다시 하세요.", 409, "conflict");
}
