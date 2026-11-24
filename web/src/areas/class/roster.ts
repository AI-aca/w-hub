// 수업: 학생·반편성 — 반 배정, 반편성 점수(대수·기하·조합 → 총점 자동), 요약 막대(인원/점수), 머리글 정렬
import { html, nothing, type TemplateResult } from "lit-html";
import { live } from "lit-html/directives/live.js";
import { api } from "../../shared/core/api";
import { errMsg, openDialog, toast } from "../../shared/ui/ui";
import type { App } from "../../shell/app";
import { can, centersOf } from "../../shell/app";
import { head } from "../../shell/layout";
import { classes, className, type Enr, loadRoster, S } from "./state";

const SC = [["alg", "대수"], ["geo", "기하"], ["com", "조합"]] as const;
const V = { summary: "people" as "people" | "score", sort: "name", desc: false, showLeft: false };

async function save(app: App, r: Enr, patch: Partial<Enr>): Promise<void> {
  const next = { ...r, ...patch };
  try {
    const x = await api<{ ver: number; scores: Enr["scores"] }>("rosterSave", { course_id: S.courseId, ...next });
    Object.assign(r, patch, { ver: x.ver, scores: x.scores });
  } catch (e) {
    toast(errMsg(e), "bad");
    if ((e as { code?: string }).code === "conflict") await loadRoster(app, S.courseId);
  }
  app.redraw();
}

function addDialog(app: App): void {
  const st = { q: "", rows: [] as { id: string; name: string; name_no: number; center_id: number | null; school_name: string }[], pick: new Set<string>(), busy: false };
  const cn = (id: number | null) => centersOf(app).find((c) => c.id === id)?.name ?? "";
  const search = async (redraw: () => void) => {
    try { st.rows = (await api<{ rows: typeof st.rows }>("rosterCandidates", { course_id: S.courseId, q: st.q })).rows; } catch (e) { toast(errMsg(e), "bad"); }
    redraw();
  };
  const d = openDialog("학생 추가", (close, redraw) => html`<div class="db" style="min-width:460px">
    <div class="bar"><input class="sel" type="search" placeholder="이름·학교" .value=${st.q} @input=${(e: Event) => { st.q = (e.target as HTMLInputElement).value; }}
      @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter") void search(redraw); }}><button class="btn" @click=${() => search(redraw)}>찾기</button></div>
    <div style="max-height:320px;overflow:auto">${st.rows.length ? st.rows.map((r) => html`<label class="item"><input type="checkbox" .checked=${st.pick.has(r.id)}
      @change=${(e: Event) => { if ((e.target as HTMLInputElement).checked) st.pick.add(r.id); else st.pick.delete(r.id); redraw(); }}>
      ${r.name}${r.name_no ? ` (${r.name_no})` : ""}<small>${r.school_name} ${cn(r.center_id)}</small></label>`) : html`<div class="note">학생 명부에서 찾습니다. 명부에 없으면 학생 메뉴에서 먼저 등록하세요.</div>`}</div>
  </div><div class="df"><span class="note">${st.pick.size}명 선택</span><div class="sp"></div><button class="btn" @click=${close}>취소</button>
    <button class="btn pri" ?disabled=${!st.pick.size || st.busy} @click=${async () => {
      st.busy = true; redraw();
      try { S.roster = (await api<{ rows: Enr[] }>("rosterAdd", { course_id: S.courseId, student_ids: [...st.pick] })).rows; toast(`${st.pick.size}명을 넣었습니다.`, "ok"); close(); app.redraw(); }
      catch (e) { toast(errMsg(e), "bad"); st.busy = false; redraw(); }
    }}>넣기</button></div>`);
  void search(d.redraw);
}

function summary(rows: Enr[]): TemplateResult {
  const cls = classes();
  if (V.summary === "score") {
    const avg = (k: string) => { const v = rows.map((r) => r.scores[k]).filter((x): x is number => x != null); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : "-"; };
    return html`<span>총점 평균 <b>${avg("total")}</b></span>${SC.map(([k, n]) => html`<span>${n} 평균 <b>${avg(k)}</b></span>`)}`;
  }
  const un = rows.filter((r) => !cls.some((c) => c.id === r.class_id)).length;
  return html`<span>총 학생 <b>${rows.length}</b>명</span>${cls.map((c) => html`<span>${c.name.replace(/\(.*?\)/g, "")} <b>${rows.filter((r) => r.class_id === c.id).length}</b>명</span>`)}<span>미배정 <b>${un}</b>명</span>`;
}

export function rosterMain(app: App): TemplateResult {
  const ed = can(app, "class", "editor");
  if (!S.roster) return html`<div class="loading">불러오는 중…</div>`;
  const cn = (id: number | null) => centersOf(app).find((c) => c.id === id)?.name ?? "";
  const all = S.roster.filter((r) => V.showLeft || r.status === "active");
  const val = (r: Enr): string | number => V.sort === "name" ? r.name : V.sort === "center" ? cn(r.center_id) : V.sort === "class" ? className(r.class_id) : (r.scores[V.sort] ?? -1);
  const rows = [...all].sort((a, b) => { const x = val(a), y = val(b); const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "ko"); return V.desc ? -c : c; });
  const th = (k: string, label: string) => html`<th class="click" @click=${() => { V.desc = V.sort === k ? !V.desc : k !== "name" && k !== "center" && k !== "class"; V.sort = k; app.redraw(); }}>${label}${V.sort === k ? (V.desc ? " ▼" : " ▲") : ""}</th>`;
  const num = (r: Enr, k: string) => html`<td class="inp"><input type="number" step="0.5" min="0" aria-label=${k} ?readonly=${!ed} .value=${live(r.scores[k] == null ? "" : String(r.scores[k]))}
    @change=${(e: Event) => { const v = (e.target as HTMLInputElement).value; void save(app, r, { scores: { ...r.scores, [k]: v === "" ? null : Number(v) } }); }}></td>`;
  return html`${head({ crumb: "수업", title: "학생·반편성", chips: html`<span class="chip">${all.length}명</span>`,
    actions: ed ? html`<button class="btn pri" @click=${() => addDialog(app)}>+ 학생 추가</button>` : undefined })}
  <div class="content">
    <div class="bar sumbar"><select class="sel" style="width:auto" aria-label="요약 종류" @change=${(e: Event) => { V.summary = (e.target as HTMLSelectElement).value as typeof V.summary; app.redraw(); }}>
      <option value="people" ?selected=${V.summary === "people"}>👥 인원 정보</option><option value="score" ?selected=${V.summary === "score"}>📊 점수 정보</option></select>
      ${summary(all)}<div class="sp"></div>
      <label class="note" style="display:flex;gap:6px;align-items:center"><input type="checkbox" .checked=${V.showLeft} @change=${(e: Event) => { V.showLeft = (e.target as HTMLInputElement).checked; app.redraw(); }}>그만둔 학생도 보기</label></div>
    ${rows.length ? html`<div class="gridwrap"><table class="g roster"><thead><tr>
      ${th("name", "이름")}${th("center", "센터")}<th>학교</th>${th("class", "반")}${SC.map(([k, n]) => th(k, n))}${th("total", "총점")}<th>메모</th><th>상태</th></tr></thead>
      <tbody>${rows.map((r) => html`<tr class=${r.status === "left" ? "past" : ""}>
        <td><b>${r.name}${r.name_no ? ` (${r.name_no})` : ""}</b></td><td>${cn(r.center_id)}</td><td>${r.school_name}</td>
        <td style="padding:0"><select aria-label="반" ?disabled=${!ed} @change=${(e: Event) => save(app, r, { class_id: Number((e.target as HTMLSelectElement).value) || null })}>
          <option value="" ?selected=${r.class_id == null}>미배정</option>${classes(true).filter((c) => c.active || c.id === r.class_id).map((c) => html`<option value=${String(c.id)} ?selected=${c.id === r.class_id}>${c.name}</option>`)}</select></td>
        ${SC.map(([k]) => num(r, k))}<td class="tot">${r.scores.total ?? ""}</td>
        <td style="padding:0"><input class="cellin" aria-label="메모" ?readonly=${!ed} .value=${live(r.note)} @change=${(e: Event) => save(app, r, { note: (e.target as HTMLInputElement).value })}></td>
        <td class="c">${ed ? html`<button class="chip ${r.status === "left" ? "" : "ok"}" @click=${() => save(app, r, { status: r.status === "left" ? "active" : "left" })}>${r.status === "left" ? "그만둠" : "수강 중"}</button>` : r.status === "left" ? "그만둠" : "수강 중"}</td>
      </tr>`)}</tbody></table></div>` : html`<div class="card"><div class="empty">수강생이 없습니다. ${ed ? "‘+ 학생 추가’로 학생 명부에서 고르세요." : ""}</div></div>`}
    ${nothing}<div class="note" style="margin-top:8px">점수를 고치면 총점이 자동으로 계산되어 저장됩니다. 머리글을 누르면 정렬됩니다.</div>
  </div>`;
}
