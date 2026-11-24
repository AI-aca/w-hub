// 수업 영역이 같이 쓰는 상태·자료 모양·불러오기. 화면 파일(overview·timetable·plan·roster·setup)은 이것만 가져다 쓴다.
import { api } from "../../shared/core/api";
import { errMsg, toast } from "../../shared/ui/ui";
import type { App } from "../../shell/app";

export interface Course { id: number; name: string; sort: number; active: boolean }
export interface Term { id: number; course_id: number; name: string; starts_on: string | null; ends_on: string | null; sort: number }
export interface Subject { id: number; course_id: number; name: string; category: "수학" | "과학" | "기타"; emoji: string; sort: number; active: boolean }
export interface Klass { id: number; course_id: number; name: string; sort: number; active: boolean }
export interface Staff { id: string; name: string; email: string | null; phone: string; subjects: string[]; memo: string; active: boolean }
export interface Cell { class_id: number; subject_id: number | null; staff_id: string | null; note: string }
export interface Slot { id: number; weekday: number; start_t: string; end_t: string; sort: number; ver: number; cells: Cell[] }
export interface Session { id: number; on_date: string; start_t: string; end_t: string; kind: "class" | "holiday"; week_label: string; note: string; important: boolean; ver: number; cells: Cell[] }
export interface Week { id: number; category: "수학" | "과학"; no: number; label: string }
export interface Curr { week_id: number; subject_id: number; class_id: number; content: string; important: boolean; ver: number; updated_at: string; updated_by: string }
export interface Ev { id: number; on_date: string; title: string; status: "todo" | "done"; note: string; important: boolean; ver: number }
export interface Meta { courses: Course[]; terms: Term[]; subjects: Subject[]; classes: Klass[]; staff: Staff[] }
export interface TermData { slots: Slot[]; sessions: Session[]; weeks: Week[]; curriculum: Curr[]; events: Ev[] }
export interface Enr {
  student_id: string; class_id: number | null; scores: Record<string, number | null>; note: string; status: "active" | "left"; ver: number;
  name: string; name_no: number; center_id: number | null; school_name: string; entry_year: number | null;
}

export const WD = ["일", "월", "화", "수", "목", "금", "토"];

export const S = {
  ws: "", meta: null as Meta | null, metaErr: "", courseId: 0, termId: 0,
  term: null as TermData | null, termLoading: 0, roster: null as Enr[] | null, rosterCourse: 0,
  busy: false,
};

export function reset(ws: string): void {
  Object.assign(S, { ws, meta: null, metaErr: "", courseId: 0, termId: 0, term: null, termLoading: 0, roster: null, rosterCourse: 0 });
}

export async function loadMeta(app: App): Promise<void> {
  try {
    setMeta(await api<Meta>("classMeta"));
    S.metaErr = "";
  } catch (e) { S.metaErr = errMsg(e); }
  app.redraw();
}
export function setMeta(m: Meta): void {
  S.meta = { courses: m.courses, terms: m.terms, subjects: m.subjects, classes: m.classes, staff: m.staff };
}

export async function loadTerm(app: App, termId: number): Promise<void> {
  S.termLoading = termId;
  try { setTerm(await api<TermData>("classTerm", { term_id: termId })); } catch (e) { toast(errMsg(e), "bad"); }
  S.termLoading = 0;
  app.redraw();
}
export function setTerm(d: TermData): void {
  S.term = { slots: d.slots, sessions: d.sessions, weeks: d.weeks, curriculum: d.curriculum, events: d.events };
}

export async function loadRoster(app: App, courseId: number): Promise<void> {
  S.rosterCourse = courseId;
  try { S.roster = (await api<{ rows: Enr[] }>("rosterList", { course_id: courseId })).rows; } catch (e) { toast(errMsg(e), "bad"); }
  app.redraw();
}

/** 서버 호출 + 학기 자료 다시 받기. 실패하면 알림만. */
export async function termCall(app: App, action: string, body: Record<string, unknown>, okMsg = ""): Promise<boolean> {
  try {
    setTerm(await api<TermData>(action, { term_id: S.termId, ...body }));
    if (okMsg) toast(okMsg, "ok");
    app.redraw();
    return true;
  } catch (e) {
    toast(errMsg(e), "bad");
    if ((e as { code?: string }).code === "conflict") await loadTerm(app, S.termId);
    return false;
  }
}

export const subjects = (cat?: string) => (S.meta?.subjects ?? []).filter((s) => s.course_id === S.courseId && (!cat || s.category === cat));
export const classes = (all = false) => (S.meta?.classes ?? []).filter((c) => c.course_id === S.courseId && (all || c.active));
export const terms = () => (S.meta?.terms ?? []).filter((t) => t.course_id === S.courseId);
export const subjName = (id: number | null) => (S.meta?.subjects.find((s) => s.id === id)?.name ?? "");
export const subjOf = (id: number | null) => S.meta?.subjects.find((s) => s.id === id);
export const staffName = (id: string | null) => (S.meta?.staff.find((s) => s.id === id)?.name ?? "");
export const className = (id: number | null) => (S.meta?.classes.find((c) => c.id === id)?.name ?? "");

/** 2026-08-22 → 26-08-22 (토) (옛 사이트와 같은 모양) */
export function dlabel(d: string): string {
  const t = new Date(d + "T00:00:00");
  if (Number.isNaN(t.getTime())) return d;
  return `${d.slice(2)} (${WD[t.getDay()]})`;
}
export const today = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
