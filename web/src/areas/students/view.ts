// 학생: 왼쪽 = 범위(센터)·검색·명단, 오른쪽 = 한 학생(기본 정보·성적·수업·입시·변경 기록)
import { html, nothing, type TemplateResult } from "lit-html";
import { live } from "lit-html/directives/live.js";
import { api } from "../../shared/core/api";
import { go, href } from "../../shared/core/route";
import { ask, errMsg, toast, ymd, ymdhm } from "../../shared/ui/ui";
import { type Col, table, type TableState } from "../../shared/ui/table";
import type { App, View } from "../../shell/app";
import { can, centersOf, myCenters } from "../../shell/app";
import { head } from "../../shell/layout";

interface Row { id: string; name: string; name_no: number; center_id: number | null; school_name: string; entry_year: number | null; status: string; updated_at: string }
interface Student extends Row { student_phone: string; parent_phone: string; memo: string; ver: number; created_at: string; created_by: string; updated_by: string }
interface Detail { student: Student; aliases: { source: string; source_key: string }[]; history: { at: string; email: string; action: string; detail: Record<string, unknown> }[] }

const S = {
  ws: "", rows: [] as Row[], loaded: false, loading: false, err: "",
  center: "", q: "", archived: false,
  tbl: { sort: "name", desc: false } as TableState,
  detailId: "", detail: null as Detail | null, form: null as Partial<Student> | null, saving: false,
};

async function loadList(app: App): Promise<void> {
  S.loading = true;
  try {
    S.rows = (await api<{ rows: Row[] }>("studentList", { include_archived: S.archived })).rows;
    S.loaded = true; S.err = "";
  } catch (e) { S.err = errMsg(e); }
  S.loading = false;
  app.redraw();
}
async function loadDetail(app: App, id: string): Promise<void> {
  S.detailId = id; S.detail = null;
  try {
    S.detail = await api<Detail>("studentGet", { id });
    S.form = { ...S.detail.student };
  } catch (e) { toast(errMsg(e), "bad"); go(app.ws, "students"); }
  app.redraw();
}

const label = (r: Row) => r.name + (r.name_no ? ` (${r.name_no})` : "");

function filtered(): Row[] {
  const q = S.q.trim();
  return S.rows.filter((r) => (!S.center || String(r.center_id ?? "") === S.center) && (!q || r.name.includes(q) || r.school_name.includes(q)));
}

export function studentsView(app: App): View {
  if (S.ws !== app.ws) Object.assign(S, { ws: app.ws, rows: [], loaded: false, center: "", q: "", detailId: "", detail: null, form: null });
  if (!S.loaded && !S.loading && !S.err) void loadList(app);
  const sel = app.route.parts[0] ?? "";
  if (sel && sel !== "new" && sel !== S.detailId) void loadDetail(app, sel);
  if (sel === "new" && S.detailId !== "new") { S.detailId = "new"; S.detail = null; S.form = { name: "", name_no: 0, center_id: myCenters(app, "students")[0]?.id ?? null, school_name: "", entry_year: null, student_phone: "", parent_phone: "", memo: "" }; }
  if (!sel) { S.detailId = ""; S.detail = null; }

  const cens = myCenters(app, "students");
  const cn = (id: number | null) => centersOf(app).find((c) => c.id === id)?.name ?? "—";
  const list = filtered();
  const side = html`
    <div class="s1">
      <div class="lab">센터</div>
      <select class="sel" aria-label="센터" .value=${S.center} @change=${(e: Event) => { S.center = (e.target as HTMLSelectElement).value; app.redraw(); }}>
        <option value="">${cens.length === centersOf(app).length ? "전체 센터" : "내 담당 센터 전체"}</option>
        ${cens.map((c) => html`<option value=${String(c.id)}>${c.name}</option>`)}
      </select>
      <input class="sel" type="search" placeholder="이름·학교 검색" aria-label="학생 검색" .value=${S.q} @input=${(e: Event) => { S.q = (e.target as HTMLInputElement).value; app.redraw(); }}>
    </div>
    <div class="s2" aria-label="학생 명단">
      <div class="grp">학생 ${list.length}명</div>
      ${list.slice(0, 400).map((r) => html`<a class="item ${r.id === sel ? "on" : ""}" href=${href(app.ws, "students", r.id)}>
        ${label(r)}${r.status === "archived" ? html`<span class="chip">보관</span>` : nothing}<small>${r.school_name || cn(r.center_id)}</small></a>`)}
      ${list.length > 400 ? html`<div class="note" style="padding:8px">검색으로 좁혀 주세요.</div>` : nothing}
    </div>
    <div class="s3">
      ${can(app, "students", "editor") ? html`<a class="btn pri wide" href=${href(app.ws, "students", "new")}>+ 학생 등록</a>` : nothing}
      <label class="note" style="display:flex;gap:6px;align-items:center"><input type="checkbox" .checked=${S.archived}
        @change=${(e: Event) => { S.archived = (e.target as HTMLInputElement).checked; void loadList(app); }}>보관한 학생도 보기</label>
    </div>`;

  let main: TemplateResult;
  if (S.err) main = html`${head({ title: "학생" })}<div class="content"><div class="empty">${S.err}</div></div>`;
  else if (!sel) main = listMain(app, list, cn);
  else if (sel === "new") main = formMain(app, null);
  else if (!S.detail) main = html`<div class="loading">불러오는 중…</div>`;
  else main = detailMain(app, cn);
  return { side, main };
}

function listMain(app: App, list: Row[], cn: (id: number | null) => string): TemplateResult {
  const cols: Col<Row>[] = [
    { key: "name", label: "이름", value: label, cell: (r) => html`<b>${label(r)}</b>` },
    { key: "center", label: "센터", value: (r) => cn(r.center_id) },
    { key: "school", label: "학교", value: (r) => r.school_name },
    { key: "entry", label: "중1 입학", value: (r) => r.entry_year, num: true },
    { key: "upd", label: "마지막 수정", value: (r) => r.updated_at, cell: (r) => ymd(r.updated_at) },
  ];
  return html`${head({ title: "학생", chips: html`<span class="chip">${list.length}명</span>` })}
    <div class="content"><div class="card" style="overflow:auto">
      ${S.loading && !S.loaded ? html`<div class="loading">불러오는 중…</div>` : table(list, cols, S.tbl, { redraw: app.redraw, onRow: (r) => go(app.ws, "students", r.id), empty: "학생이 없습니다." })}
    </div></div>`;
}

function detailMain(app: App, cn: (id: number | null) => string): TemplateResult {
  const d = S.detail!;
  const s = d.student;
  const tab = app.route.parts[1] ?? "info";
  const base = (t: string) => href(app.ws, "students", s.id, t);
  const isWeiz = app.ws === "weiz";
  const tabs = [
    { key: "info", label: "기본 정보", href: base("info") },
    { key: "scores", label: "성적", off: true },
    ...(isWeiz ? [{ key: "class", label: "수업", off: true }] : []),
    { key: "admission", label: "입시", off: true },
    { key: "history", label: "변경 기록", href: base("history") },
  ];
  const body = tab === "history"
    ? html`<div class="card"><div class="cb">${d.history.length ? html`<ul class="tl">${d.history.map((h) => html`<li><div class="d">${ymdhm(h.at)}</div>
        <div class="t"><b>${h.action}</b> · ${h.email}${h.detail.changes ? html`<div class="note">${Object.entries(h.detail.changes as Record<string, [unknown, unknown]>).map(([k, [a, b]]) => html`${k}: ${String(a ?? "") || "(없음)"} → ${String(b ?? "") || "(없음)"}<br>`)}</div>` : nothing}</div></li>`)}</ul>` : html`<div class="empty">기록이 없습니다.</div>`}</div></div>`
    : formBody(app, s);
  return html`${head({
    crumb: `학생 › ${cn(s.center_id)}`,
    title: html`${label(s)}`,
    chips: html`${s.school_name ? html`<span class="chip">${s.school_name}</span>` : nothing}${s.status === "archived" ? html`<span class="chip warn">보관됨</span>` : nothing}`,
    actions: can(app, "students", "admin") ? html`<button class="btn sm" @click=${() => archive(app, s, s.status !== "archived")}>${s.status === "archived" ? "보관 해제" : "보관"}</button>` : undefined,
    tabs, tab,
  })}<div class="content">${body}</div>`;
}

function formMain(app: App, _s: Student | null): TemplateResult {
  return html`${head({ crumb: "학생", title: "학생 등록" })}<div class="content">${formBody(app, null)}</div>`;
}

function formBody(app: App, s: Student | null): TemplateResult {
  const f = S.form ?? {};
  const ro = !can(app, "students", "editor");
  const set = (k: keyof Student) => (e: Event) => { (f as Record<string, unknown>)[k] = (e.target as HTMLInputElement).value; };
  const cens = myCenters(app, "students");
  return html`<div class="card" style="max-width:820px"><div class="cb">
    <form class="form" @submit=${(e: Event) => { e.preventDefault(); void save(app, s); }}>
      <label class="fld"><span>이름</span><input name="name" required maxlength="40" .value=${live(f.name ?? "")} ?disabled=${ro} @input=${set("name")}></label>
      <label class="fld"><span>동명 번호 <small class="note">같은 이름이 있을 때만</small></span><input name="name_no" type="number" min="0" max="99" .value=${live(String(f.name_no ?? 0))} ?disabled=${ro} @input=${set("name_no")}></label>
      <label class="fld"><span>센터</span><select name="center_id" ?disabled=${ro} @change=${set("center_id")}>
        ${cens.length === centersOf(app).length ? html`<option value="" ?selected=${f.center_id == null}>(센터 없음)</option>` : nothing}
        ${cens.map((c) => html`<option value=${String(c.id)} ?selected=${f.center_id === c.id}>${c.name}</option>`)}</select></label>
      <label class="fld"><span>학교</span><input name="school_name" maxlength="40" .value=${live(f.school_name ?? "")} ?disabled=${ro} @input=${set("school_name")}></label>
      <label class="fld"><span>중1 입학 연도</span><input name="entry_year" type="number" min="2000" max="2100" .value=${live(f.entry_year == null ? "" : String(f.entry_year))} ?disabled=${ro} @input=${set("entry_year")}></label>
      <div></div>
      <label class="fld"><span>학생 연락처</span><input name="student_phone" maxlength="30" .value=${live(f.student_phone ?? "")} ?disabled=${ro} @input=${set("student_phone")}></label>
      <label class="fld"><span>학부모 연락처</span><input name="parent_phone" maxlength="30" .value=${live(f.parent_phone ?? "")} ?disabled=${ro} @input=${set("parent_phone")}></label>
      <label class="fld full"><span>메모</span><textarea name="memo" maxlength="2000" .value=${live(f.memo ?? "")} ?disabled=${ro} @input=${set("memo")}></textarea></label>
      ${ro ? nothing : html`<div class="full" style="display:flex;gap:8px;align-items:center">
        <button class="btn pri" type="submit" ?disabled=${S.saving}>${S.saving ? "저장 중…" : "저장"}</button>
        ${s ? html`<span class="note">마지막 수정 ${ymdhm(s.updated_at)} · ${s.updated_by}</span>` : html`<a class="btn" href=${href(app.ws, "students")}>취소</a>`}</div>`}
    </form></div></div>`;
}

async function save(app: App, s: Student | null): Promise<void> {
  if (S.saving) return;
  S.saving = true; app.redraw();
  try {
    const r = await api<{ id: string }>("studentSave", { ...S.form, id: s?.id, ver: s?.ver });
    toast("저장했습니다.", "ok");
    await loadList(app);
    S.detailId = "";
    go(app.ws, "students", r.id);
  } catch (e) { toast(errMsg(e), "bad"); }
  S.saving = false; app.redraw();
}

async function archive(app: App, s: Student, archived: boolean): Promise<void> {
  if (archived && !(await ask("학생 보관", `${s.name} 학생을 보관할까요? 성적·기록은 그대로 남고 명단에서만 빠집니다.`, "보관"))) return;
  try {
    await api("studentArchive", { id: s.id, archived });
    toast(archived ? "보관했습니다." : "보관을 해제했습니다.", "ok");
    await loadList(app);
    await loadDetail(app, s.id);
  } catch (e) { toast(errMsg(e), "bad"); }
}
