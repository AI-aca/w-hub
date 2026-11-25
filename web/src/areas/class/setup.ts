// 수업: 설정(관리 권한) — 과정·학기·과목(수학/과학, 이모지)·반(담임 강사). 지우면 쓰인 곳이 있을 때 숨김. 강사는 관리 › 센터·학교·강사.
import { html, nothing, type TemplateResult } from "lit-html";
import { api } from "../../shared/core/api";
import { go, href } from "../../shared/core/route";
import { ask, errMsg, openDialog, toast } from "../../shared/ui/ui";
import type { App } from "../../shell/app";
import { head } from "../../shell/layout";
import { classes, type Meta, S, setMeta, subjects, terms } from "./state";

type Kind = "course" | "term" | "subject" | "class";
const KO: Record<Kind, string> = { course: "과정", term: "학기", subject: "과목", class: "반" };

async function call(app: App, body: Record<string, unknown>, msg: string): Promise<boolean> {
  try {
    const r = await api<Meta & { result?: string }>("classSetup", { course_id: S.courseId, ...body });
    setMeta(r);
    toast(r.result === "hidden" ? "쓰인 곳이 있어 목록에서 숨겼습니다." : msg, "ok");
    app.redraw();
    return true;
  } catch (e) { toast(errMsg(e), "bad"); return false; }
}

function edit(app: App, kind: Kind, cur: Record<string, unknown> | null): void {
  const f: Record<string, unknown> = { name: "", sort: 0, category: "수학", emoji: "", starts_on: "", ends_on: "", active: true, ...(kind === "class" ? { homeroom_staff_id: "" } : {}), ...(cur ?? {}) };
  const inp = (k: string, label: string, type = "text") => html`<label class="fld"><span>${label}</span><input type=${type} .value=${String(f[k] ?? "")}
    @input=${(e: Event) => { f[k] = (e.target as HTMLInputElement).value; }}></label>`;
  openDialog(`${KO[kind]} ${cur ? "고치기" : "추가"}`, (close) => html`<div class="db"><div class="form">
    ${inp("name", "이름")}${inp("sort", "순서", "number")}
    ${kind === "subject" ? html`<label class="fld"><span>구분</span><select @change=${(e: Event) => { f.category = (e.target as HTMLSelectElement).value; }}>
      ${["수학", "과학", "기타"].map((c) => html`<option ?selected=${c === f.category}>${c}</option>`)}</select></label>${inp("emoji", "이모지(선택)")}` : nothing}
    ${kind === "term" ? html`${inp("starts_on", "시작일", "date")}${inp("ends_on", "끝나는 날", "date")}` : nothing}
    ${kind === "class" ? html`<label class="fld"><span>담임 강사</span><select aria-label="담임 강사" @change=${(e: Event) => { f.homeroom_staff_id = (e.target as HTMLSelectElement).value; }}>
      <option value="">미정</option>${(S.meta?.staff ?? []).filter((s) => s.active || s.id === f.homeroom_staff_id).map((s) => html`<option value=${s.id} ?selected=${s.id === f.homeroom_staff_id}>${s.name}</option>`)}</select></label>` : nothing}
    ${cur && kind !== "term" ? html`<label class="full" style="display:flex;gap:6px;align-items:center"><input type="checkbox" .checked=${f.active !== false}
      @change=${(e: Event) => { f.active = (e.target as HTMLInputElement).checked; }}>목록에 보이기</label>` : nothing}
  </div></div><div class="df">
    ${cur && kind !== "course" ? html`<button class="btn bad" @click=${async () => {
      if (await ask(`${KO[kind]} 지우기`, `${String(cur.name)} 을(를) 지울까요? 시간표·진도에 쓰인 적이 있으면 지우지 않고 목록에서만 숨깁니다.`, "지우기")
        && await call(app, { kind, id: cur.id, remove: true }, "지웠습니다.")) close();
    }}>지우기</button>` : nothing}
    <div class="sp"></div><button class="btn" @click=${close}>취소</button>
    <button class="btn pri" @click=${async () => { if (await call(app, { kind, id: cur?.id, ...f, course_id: kind === "course" ? undefined : S.courseId }, "저장했습니다.")) close(); }}>저장</button></div>`);
}

const list = (app: App, kind: Kind, items: Record<string, unknown>[], sub: (x: Record<string, unknown>) => string) => html`
  <div class="card"><div class="ch"><h3>${KO[kind]}</h3><span class="chip">${items.length}</span><div class="sp"></div>
    ${kind !== "course" && !S.courseId ? nothing : html`<button class="btn sm" @click=${() => edit(app, kind, null)}>+ 추가</button>`}</div>
    <div class="cb" style="padding:4px 8px">${items.length ? items.map((x) => html`<a class="item" @click=${() => edit(app, kind, x)}>
      ${String(x.name)}${x.active === false ? html`<span class="chip">숨김</span>` : nothing}<small>${sub(x)}</small></a>`) : html`<div class="note" style="padding:8px">없습니다.</div>`}</div></div>`;

export function setupMain(app: App): TemplateResult {
  const m = S.meta!;
  const course = m.courses.find((c) => c.id === S.courseId);
  return html`${head({ crumb: "수업", title: "설정", chips: course ? html`<span class="chip">${course.name}</span>` : undefined })}
  <div class="content">
    <div class="kpis" style="grid-template-columns:repeat(2,minmax(0,1fr))">
      ${list(app, "course", m.courses as unknown as Record<string, unknown>[], (x) => (x.id === S.courseId ? "지금 보는 과정" : ""))}
      ${list(app, "term", terms() as unknown as Record<string, unknown>[], (x) => [x.starts_on, x.ends_on].filter(Boolean).join(" ~ "))}
      ${list(app, "subject", subjects() as unknown as Record<string, unknown>[], (x) => `${String(x.category)} ${String(x.emoji)}`)}
      ${list(app, "class", classes(true) as unknown as Record<string, unknown>[], (x) => { const n = S.meta?.staff.find((s) => s.id === x.homeroom_staff_id)?.name; return n ? `담임 ${n}` : ""; })}
    </div>
    <div class="card"><div class="ch"><h3>강사</h3><span class="chip">${m.staff.filter((s) => s.active).length}</span><div class="sp"></div>
      ${app.me.user.is_owner ? html`<a class="btn sm" href=${href(app.ws, "admin", "org")}>관리에서 고치기</a>` : nothing}</div>
      <div class="cb">${m.staff.length ? m.staff.map((s) => html`<span class="chip" style="margin:0 6px 6px 0">${s.name}${s.subjects.length ? ` · ${s.subjects.join("·")}` : ""}${s.active ? "" : " (숨김)"}</span>`)
        : html`<div class="note">강사는 원장님이 관리 › 센터·학교·강사에서 넣습니다.</div>`}</div></div>
    ${S.termId ? nothing : html`<p class="note">과정과 학기를 만들면 시간표·진도 화면이 열립니다.</p>`}
    ${S.termId ? html`<p class="note"><a href="#" @click=${(e: Event) => { e.preventDefault(); go(app.ws, "class", String(S.termId), "overview"); }}>대시보드로</a></p>` : nothing}
  </div>`;
}
