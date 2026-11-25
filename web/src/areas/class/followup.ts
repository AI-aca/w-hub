// 조치(사후관리) 기록: 집중관리·과목 경보가 같이 쓰는 기록 줄·입력 줄. 저장은 followupSave(참고사이트 followups 와 같은 항목).
import { html, nothing, type TemplateResult } from "lit-html";
import { api } from "../../shared/core/api";
import { ask, errMsg, toast } from "../../shared/ui/ui";
import { type App, can } from "../../shell/app";
import { track } from "./busy";
import { S, today } from "./state";

export interface Fu {
  id: number; student_id: string; class_id: number | null; subject_id: number | null; staff_id: string | null; staff_name: string;
  on_date: string; kind: string; body: string; alert_key: string | null; created_by: string;
}
export const KINDS = ["보충수업", "학생 상담", "학부모 상담", "과제 재제출", "기타"];
/** 조치 기록이 바뀔 때마다 늘어남(집중관리·과목 경보가 다시 불러오는 표시) */
export const fuDirty = { n: 0 };
export const md = (s: string) => (s ? `${+s.slice(5, 7)}/${+s.slice(8, 10)}` : "");

/** 기록 줄들. 쓴 사람·관리 권한이면 × 로 지울 수 있다. */
export function logLines(app: App, L: Fu[], after: () => void): TemplateResult {
  if (!L.length) return html`<span class="note">기록 없음</span>`;
  const adm = can(app, "scores_weekly", "admin"), me = app.me.user.email;
  return html`<div class="lg-list">${L.map((f) => html`<div class="lg-line"><b>${md(f.on_date)}</b><span class="lg-t">${f.kind}</span><span class="note">${f.staff_name}</span>
    <span class="lg-x">${f.body}</span>${(adm || f.created_by === me) && can(app, "scores_weekly", "editor") ? html`<button class="lg-del" title="기록 지우기" aria-label="기록 지우기"
      @click=${async () => {
        if (!(await ask("기록 지우기", `${md(f.on_date)} ${f.kind} 기록을 지울까요?`, "지우기"))) return;
        try { await track(api("followupDelete", { id: f.id })); fuDirty.n++; toast("지웠습니다.", "ok"); after(); } catch (e) { toast(errMsg(e), "bad"); }
      }}>×</button>` : nothing}</div>`)}</div>`;
}

export interface FormOpt { student_id: string; subject_id: number | null; staff_id: string | null; from?: string; alert_key?: string | null; hint: string }
/** 표 안에 펼치는 입력 줄(날짜·유형·작성 교사·내용). 저장되면 done() */
const F = { key: "", on_date: "", kind: KINDS[0], staff_id: "", body: "" };
export function fuForm(o: FormOpt, cols: number, cancel: () => void, done: () => void): TemplateResult {
  const key = `${o.student_id}:${o.subject_id}:${o.alert_key ?? ""}`;
  if (F.key !== key) { const t = today(); Object.assign(F, { key, on_date: o.from && t < o.from ? o.from : t, kind: KINDS[0], staff_id: o.staff_id ?? "", body: "" }); }
  const f = F;
  const staff = (S.meta?.staff ?? []).filter((s) => s.active || s.id === o.staff_id);
  let el: HTMLInputElement | null = null;
  const save = async () => {
    if (!f.on_date || !f.body.trim()) { el?.focus(); toast("날짜와 내용을 넣어 주세요.", "bad"); return; }
    try {
      await track(api("followupSave", { term_id: S.termId, student_id: o.student_id, subject_id: o.subject_id, staff_id: f.staff_id || null,
        on_date: f.on_date, kind: f.kind, body: f.body.trim(), alert_key: o.alert_key ?? null }));
      fuDirty.n++;
      toast("기록했습니다.", "ok");
      F.key = "";
      done();
    } catch (e) { toast(errMsg(e), "bad"); }
  };
  return html`<tr class="fu-form"><td colspan=${String(cols)}><div class="fu-f">
    <input class="sel" type="date" style="width:auto" aria-label="날짜" .value=${f.on_date} @change=${(e: Event) => { f.on_date = (e.target as HTMLInputElement).value; }}>
    <select class="sel" style="width:auto" aria-label="조치 유형" @change=${(e: Event) => { f.kind = (e.target as HTMLSelectElement).value; }}>${KINDS.map((k) => html`<option ?selected=${k === f.kind}>${k}</option>`)}</select>
    <select class="sel" style="width:auto" aria-label="작성 교사" @change=${(e: Event) => { f.staff_id = (e.target as HTMLSelectElement).value; }}>
      <option value="">교사 선택</option>${staff.map((s) => html`<option value=${s.id} ?selected=${s.id === f.staff_id}>${s.name}</option>`)}</select>
    <input class="sel" style="flex:1;min-width:220px" aria-label="내용" maxlength="500" placeholder=${o.hint} .value=${f.body}
      @input=${(e: Event) => { el = e.target as HTMLInputElement; f.body = el.value; }} @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter") void save(); }}>
    <button class="btn pri" @click=${save}>저장</button><button class="btn" @click=${() => { F.key = ""; cancel(); }}>취소</button>
  </div></td></tr>`;
}
