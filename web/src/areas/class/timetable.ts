// 수업: 시간표 요약(요일 틀) · 시간표 상세(날짜별 회차·휴강) · 주차 일괄 생성
import { html, nothing, type TemplateResult } from "lit-html";
import { go } from "../../shared/core/route";
import { ask, openDialog, toast } from "../../shared/ui/ui";
import type { App } from "../../shell/app";
import { can } from "../../shell/app";
import { head } from "../../shell/layout";
import { type Cell, classes, dlabel, S, type Session, type Slot, staffName, subjects, subjOf, termCall, WD } from "./state";

const ORDER = [1, 2, 3, 4, 5, 6, 0];
let hidePast = false;

function cellView(c: Cell | undefined, nth = 0): TemplateResult {
  if (!c || (!c.subject_id && !c.staff_id && !c.note)) return html`<span class="note">—</span>`;
  const s = subjOf(c.subject_id);
  return html`<div class="ttc"><b>${s ? `${s.emoji} ${s.name}`.trim() : ""}${s && nth ? html` <span class="nth">${nth}차</span>` : nothing}</b><small>${staffName(c.staff_id)}</small>${c.note ? html`<small>${c.note}</small>` : nothing}</div>`;
}

/** 칸 하나(반) 고치기: 과목·강사·메모. 저장하면 그 줄 전체를 다시 보낸다. */
function editCell(title: string, cur: Cell | undefined, classId: number, onSave: (c: Cell | null) => Promise<boolean>): void {
  const f: Cell = { class_id: classId, subject_id: cur?.subject_id ?? null, staff_id: cur?.staff_id ?? null, note: cur?.note ?? "" };
  const staff = (S.meta?.staff ?? []).filter((x) => x.active || x.id === f.staff_id);
  openDialog(title, (close) => html`<div class="db"><div class="form">
    <label class="fld"><span>과목</span><select @change=${(e: Event) => { f.subject_id = Number((e.target as HTMLSelectElement).value) || null; }}>
      <option value="">(비움)</option>${subjects().filter((s) => s.active || s.id === f.subject_id).map((s) => html`<option value=${String(s.id)} ?selected=${s.id === f.subject_id}>${s.emoji} ${s.name}</option>`)}</select></label>
    <label class="fld"><span>강사</span><select @change=${(e: Event) => { f.staff_id = (e.target as HTMLSelectElement).value || null; }}>
      <option value="">(비움)</option>${staff.map((s) => html`<option value=${s.id} ?selected=${s.id === f.staff_id}>${s.name}${s.subjects.length ? ` (${s.subjects.join("·")})` : ""}</option>`)}</select></label>
    <label class="fld full"><span>메모</span><input maxlength="200" .value=${f.note} @input=${(e: Event) => { f.note = (e.target as HTMLInputElement).value; }}></label>
  </div></div><div class="df">
    <button class="btn bad" @click=${async () => { if (await onSave(null)) close(); }}>칸 비우기</button><div class="sp"></div>
    <button class="btn" @click=${close}>취소</button>
    <button class="btn pri" @click=${async () => { if (await onSave(f)) close(); }}>저장</button></div>`);
}

const withCell = (cells: Cell[], classId: number, c: Cell | null): Cell[] =>
  [...cells.filter((x) => x.class_id !== classId), ...(c && (c.subject_id || c.staff_id || c.note) ? [c] : [])];

function editSlot(app: App, s: Slot | null): void {
  const f = { weekday: s?.weekday ?? 6, start_t: s?.start_t ?? "", end_t: s?.end_t ?? "" };
  openDialog(s ? "시간대 고치기" : "시간대 추가", (close) => html`<div class="db"><div class="form">
    <label class="fld"><span>요일</span><select @change=${(e: Event) => { f.weekday = Number((e.target as HTMLSelectElement).value); }}>
      ${ORDER.map((d) => html`<option value=${String(d)} ?selected=${d === f.weekday}>${WD[d]}요일</option>`)}</select></label><div></div>
    <label class="fld"><span>시작</span><input type="time" .value=${f.start_t} @input=${(e: Event) => { f.start_t = (e.target as HTMLInputElement).value; }}></label>
    <label class="fld"><span>끝</span><input type="time" .value=${f.end_t} @input=${(e: Event) => { f.end_t = (e.target as HTMLInputElement).value; }}></label>
  </div></div><div class="df">
    ${s ? html`<button class="btn bad" @click=${async () => { if (await ask("시간대 삭제", `${WD[s.weekday]} ${s.start_t}~${s.end_t} 줄을 지울까요?`, "삭제") && await termCall(app, "slotDelete", { id: s.id }, "지웠습니다.")) close(); }}>삭제</button>` : nothing}
    <div class="sp"></div><button class="btn" @click=${close}>취소</button>
    <button class="btn pri" @click=${async () => { if (await termCall(app, "slotSave", { id: s?.id, ver: s?.ver, ...f, cells: s?.cells ?? [] }, "저장했습니다.")) close(); }}>저장</button></div>`);
}

function batchCreate(app: App): void {
  const days = [...new Set(S.term!.slots.map((s) => s.weekday))].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  if (!days.length) { toast("먼저 시간표 요약에 시간대를 하나 이상 넣으세요.", "bad"); return; }
  const labels = S.term!.sessions.map((s) => Number(s.week_label.replace(/\D/g, ""))).filter((n) => n > 0);
  const f = { week_label: `${(labels.length ? Math.max(...labels) : 0) + 1}주차`, dates: {} as Record<string, string> };
  openDialog("주차 일괄 생성", (close) => html`<div class="db">
    <p class="note" style="margin-top:0">시간표 요약의 요일 틀을 고른 날짜에 그대로 복사해 시간표 상세에 회차를 만듭니다.</p>
    <div class="form"><label class="fld full"><span>주차 이름</span><input .value=${f.week_label} @input=${(e: Event) => { f.week_label = (e.target as HTMLInputElement).value; }}></label>
    ${days.map((d) => html`<label class="fld"><span>${WD[d]}요일 날짜</span><input type="date" @input=${(e: Event) => { f.dates[String(d)] = (e.target as HTMLInputElement).value; }}></label>`)}
  </div></div><div class="df"><button class="btn" @click=${close}>취소</button>
    <button class="btn pri" @click=${async () => {
      if (days.some((d) => !f.dates[String(d)])) { toast("모든 요일의 날짜를 고르세요.", "bad"); return; }
      if (await termCall(app, "sessionsFromSlots", f, `${f.week_label} 회차를 만들었습니다.`)) { close(); go(app.ws, "class", String(S.termId), "detail"); }
    }}>복사 생성하기</button></div>`);
}

export function summaryMain(app: App): TemplateResult {
  const ed = can(app, "class", "editor");
  const cls = classes();
  const slots = S.term!.slots;
  return html`${head({ crumb: "수업 › 시간표", title: "시간표 요약", chips: html`<span class="chip">요일 틀</span>`,
    actions: ed ? html`<button class="btn" @click=${() => batchCreate(app)}>주차 일괄 생성</button><button class="btn pri" @click=${() => editSlot(app, null)}>+ 시간대 추가</button>` : undefined })}
  <div class="content">${slots.length ? html`<div class="gridwrap"><table class="g tt">
    <thead><tr><th class="fx" style="left:0;min-width:110px">요일·시간</th>${cls.map((c) => html`<th style="min-width:130px">${c.name}</th>`)}</tr></thead>
    <tbody>${slots.map((s) => html`<tr>
      <td class="fx ${ed ? "click" : ""}" style="left:0" @click=${() => ed && editSlot(app, s)}><b>${WD[s.weekday]}요일</b><div class="note">${s.start_t}~${s.end_t}</div></td>
      ${cls.map((c) => { const cur = s.cells.find((x) => x.class_id === c.id); return html`<td class=${ed ? "click" : ""}
        @click=${() => ed && editCell(`${WD[s.weekday]} ${s.start_t} · ${c.name}`, cur, c.id, (n) => termCall(app, "slotSave", { ...s, cells: withCell(s.cells, c.id, n) }, "저장했습니다."))}>${cellView(cur)}</td>`; })}
    </tr>`)}</tbody></table></div>` : html`<div class="card"><div class="empty">시간대가 없습니다. ${ed ? "‘+ 시간대 추가’로 요일·시간을 넣으세요." : ""}</div></div>`}
    <div class="note" style="margin-top:8px">칸을 누르면 과목·강사를 고칩니다. 요일·시간 칸을 누르면 시간을 고치거나 지웁니다.</div></div>`;
}

function editSession(app: App, s: Session | null, kind: "class" | "holiday"): void {
  const f = { on_date: s?.on_date ?? "", start_t: s?.start_t ?? "", end_t: s?.end_t ?? "", week_label: s?.week_label ?? "", note: s?.note ?? "", important: s?.important ?? kind === "holiday", kind: s?.kind ?? kind };
  openDialog(s ? "회차 고치기" : kind === "holiday" ? "휴강 추가" : "회차 추가", (close) => html`<div class="db"><div class="form">
    <label class="fld"><span>날짜</span><input type="date" .value=${f.on_date} @input=${(e: Event) => { f.on_date = (e.target as HTMLInputElement).value; }}></label>
    <label class="fld"><span>주차</span><input placeholder="예: 3주차" .value=${f.week_label} @input=${(e: Event) => { f.week_label = (e.target as HTMLInputElement).value; }}></label>
    ${f.kind === "class" ? html`
      <label class="fld"><span>시작</span><input type="time" .value=${f.start_t} @input=${(e: Event) => { f.start_t = (e.target as HTMLInputElement).value; }}></label>
      <label class="fld"><span>끝</span><input type="time" .value=${f.end_t} @input=${(e: Event) => { f.end_t = (e.target as HTMLInputElement).value; }}></label>` : nothing}
    <label class="fld full"><span>${f.kind === "holiday" ? "휴강 사유" : "메모"}</span><input maxlength="300" .value=${f.note} @input=${(e: Event) => { f.note = (e.target as HTMLInputElement).value; }}></label>
    <label class="full" style="display:flex;gap:6px;align-items:center"><input type="checkbox" .checked=${f.important} @change=${(e: Event) => { f.important = (e.target as HTMLInputElement).checked; }}>중요 표시</label>
  </div></div><div class="df">
    ${s ? html`<button class="btn bad" @click=${async () => { if (await ask("회차 삭제", `${dlabel(s.on_date)} ${s.start_t} 줄을 지울까요?`, "삭제") && await termCall(app, "sessionDelete", { id: s.id }, "지웠습니다.")) close(); }}>삭제</button>` : nothing}
    <div class="sp"></div><button class="btn" @click=${close}>취소</button>
    <button class="btn pri" @click=${async () => { if (await termCall(app, "sessionSave", { id: s?.id, ver: s?.ver, ...f, cells: s?.cells ?? [] }, "저장했습니다.")) close(); }}>저장</button></div>`);
}

export function detailMain(app: App): TemplateResult {
  const ed = can(app, "class", "editor");
  const cls = classes();
  const today = new Date().toISOString().slice(0, 10);
  const rows = S.term!.sessions.filter((s) => !hidePast || s.on_date >= today);
  let lastWeek = "";
  // 반마다 과목이 몇 번째 수업인지(옛 사이트의 '대수 3차' 표시)
  const nth = new Map<string, number>();
  const cnt: Record<string, number> = {};
  for (const s of S.term!.sessions) for (const c of s.cells) if (s.kind === "class" && c.subject_id) {
    const k = `${c.class_id}:${c.subject_id}`;
    nth.set(`${s.id}:${c.class_id}`, (cnt[k] = (cnt[k] ?? 0) + 1));
  }
  return html`${head({ crumb: "수업 › 시간표", title: "시간표 상세", chips: html`<span class="chip">${S.term!.sessions.filter((s) => s.kind === "class").length}회차</span>`,
    actions: html`<label class="note" style="display:flex;gap:6px;align-items:center"><input type="checkbox" .checked=${hidePast} @change=${(e: Event) => { hidePast = (e.target as HTMLInputElement).checked; app.redraw(); }}>지난 회차 숨기기</label>
      ${ed ? html`<button class="btn" @click=${() => batchCreate(app)}>주차 일괄 생성</button><button class="btn" @click=${() => editSession(app, null, "holiday")}>+ 휴강 추가</button>
      <button class="btn pri" @click=${() => editSession(app, null, "class")}>+ 회차 추가</button>` : nothing}` })}
  <div class="content">${rows.length ? html`<div class="gridwrap"><table class="g tt">
    <thead><tr><th class="fx" style="left:0;min-width:70px">주차</th><th style="min-width:110px">날짜</th><th>시간</th>${cls.map((c) => html`<th style="min-width:130px">${c.name}</th>`)}</tr></thead>
    <tbody>${rows.map((s) => {
      const wk = s.week_label !== lastWeek ? (lastWeek = s.week_label) : "";
      const rowEdit = () => ed && editSession(app, s, s.kind);
      return html`<tr class=${s.kind === "holiday" ? "hol" : s.on_date < today ? "past" : ""}>
        <td class="fx" style="left:0"><b>${wk}</b></td>
        <td class=${ed ? "click" : ""} @click=${rowEdit}>${s.important ? html`<span class="star on">★</span>` : nothing}${dlabel(s.on_date)}</td>
        <td class=${ed ? "click" : ""} @click=${rowEdit}>${s.kind === "holiday" ? "" : `${s.start_t}~${s.end_t}`}</td>
        ${s.kind === "holiday" ? html`<td colspan=${cls.length} class="holnote ${ed ? "click" : ""}" @click=${rowEdit}>${s.note || "휴강"}</td>`
          : cls.map((c) => { const cur = s.cells.find((x) => x.class_id === c.id); return html`<td class=${ed ? "click" : ""}
            @click=${() => ed && editCell(`${dlabel(s.on_date)} ${s.start_t} · ${c.name}`, cur, c.id, (n) => termCall(app, "sessionSave", { ...s, cells: withCell(s.cells, c.id, n) }, "저장했습니다."))}>${cellView(cur, nth.get(`${s.id}:${c.id}`))}</td>`; })}
      </tr>`;
    })}</tbody></table></div>` : html`<div class="card"><div class="empty">회차가 없습니다. ${ed ? "‘주차 일괄 생성’으로 요약 틀을 날짜에 복사하거나 ‘+ 회차 추가’를 쓰세요." : ""}</div></div>`}
    <div class="note" style="margin-top:8px">날짜·시간 칸을 누르면 회차를 고치거나 지웁니다. 반 칸을 누르면 과목·강사를 고칩니다.</div></div>`;
}
