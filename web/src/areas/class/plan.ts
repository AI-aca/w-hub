// 수업: 진도(수학/과학). 과목별 보기 = 주차 × 반, 학급별 보기 = 주차 × 과목. 칸을 벗어나면 그 칸만 저장.
import { html, nothing, type TemplateResult } from "lit-html";
import { live } from "lit-html/directives/live.js";
import { api } from "../../shared/core/api";
import { ask, errMsg, openDialog, toast } from "../../shared/ui/ui";
import type { App } from "../../shell/app";
import { can } from "../../shell/app";
import { head } from "../../shell/layout";
import { classes, type Curr, loadTerm, S, subjects, termCall, type Week } from "./state";
import { inOrder } from "./busy";

type Cat = "수학" | "과학";
const V: Record<Cat, { mode: "subject" | "class"; pick: number }> = { 수학: { mode: "subject", pick: 0 }, 과학: { mode: "subject", pick: 0 } };
const saving = new Set<string>();

const key = (w: number, s: number, c: number) => `${w}:${s}:${c}`;
const find = (w: number, s: number, c: number): Curr | undefined => S.term!.curriculum.find((x) => x.week_id === w && x.subject_id === s && x.class_id === c);

// 같은 칸은 차례로 저장(내용을 고치고 바로 ★를 눌러도 앞 저장의 새 버전 번호로 보냄)
//   바꾸지 않는 값은 저장할 때의 최신 값을 쓴다(★만 누르면 방금 저장한 내용을 그대로 둠).
const saveCell = (app: App, w: Week, subjectId: number, classId: number, p: { content?: string; toggleStar?: boolean }) =>
  inOrder(`cu:${key(w.id, subjectId, classId)}`, () => {
    const c = find(w.id, subjectId, classId);
    return saveCellNow(app, w, subjectId, classId, p.content ?? c?.content ?? "", p.toggleStar ? !(c?.important ?? false) : c?.important ?? false);
  });
async function saveCellNow(app: App, w: Week, subjectId: number, classId: number, content: string, important: boolean): Promise<void> {
  const cur = find(w.id, subjectId, classId);
  if (cur && cur.content === content && cur.important === important) return;
  if (!cur && !content && !important) return;
  const k = key(w.id, subjectId, classId);
  saving.add(k); app.redraw();
  try {
    const r = await api<{ ver: number }>("currSave", { week_id: w.id, subject_id: subjectId, class_id: classId, content, important, ver: cur?.ver ?? 0 });
    if (cur) Object.assign(cur, { content, important, ver: r.ver });
    else S.term!.curriculum.push({ week_id: w.id, subject_id: subjectId, class_id: classId, content, important, ver: r.ver, updated_at: "", updated_by: "" });
  } catch (e) {
    toast(errMsg(e), "bad");
    if ((e as { code?: string }).code === "conflict") await loadTerm(app, S.termId);
  }
  saving.delete(k); app.redraw();
}

function editWeek(app: App, cat: Cat, w: Week | null): void {
  const f = { label: w?.label ?? "" };
  openDialog(w ? "주차 이름 바꾸기" : "주차 추가", (close) => html`<div class="db"><div class="form">
    <label class="fld full"><span>주차 이름</span><input placeholder="비우면 ‘N주차’" .value=${f.label} @input=${(e: Event) => { f.label = (e.target as HTMLInputElement).value; }}></label>
  </div></div><div class="df">
    ${w ? html`<button class="btn bad" @click=${async () => { if (await ask("주차 삭제", `${w.label} 줄과 그 주 진도를 모두 지울까요?`, "삭제") && await termCall(app, "weekSave", { category: cat, id: w.id, remove: true }, "지웠습니다.")) close(); }}>삭제</button>` : nothing}
    <div class="sp"></div><button class="btn" @click=${close}>취소</button>
    <button class="btn pri" @click=${async () => { if (await termCall(app, "weekSave", { category: cat, id: w?.id, label: f.label }, "저장했습니다.")) close(); }}>저장</button></div>`);
}

export function planMain(app: App, cat: Cat): TemplateResult {
  const ed = can(app, "class", "editor");
  const v = V[cat];
  const subs = subjects(cat).filter((s) => s.active);
  const cls = classes();
  const opts = v.mode === "subject" ? subs.map((s) => ({ id: s.id, name: `${s.emoji} ${s.name}`.trim() })) : cls.map((c) => ({ id: c.id, name: c.name }));
  if (!opts.some((o) => o.id === v.pick)) v.pick = opts[0]?.id ?? 0;
  const cols = v.mode === "subject" ? cls.map((c) => ({ id: c.id, name: c.name })) : subs.map((s) => ({ id: s.id, name: `${s.emoji} ${s.name}`.trim() }));
  const weeks = S.term!.weeks.filter((w) => w.category === cat);
  const sc = (colId: number) => (v.mode === "subject" ? [v.pick, colId] : [colId, v.pick]) as [number, number];
  const controls = html`<div class="bar">
    <div class="seg" style="width:220px">${(["subject", "class"] as const).map((m) => html`<button class=${v.mode === m ? "on" : ""} @click=${() => { v.mode = m; v.pick = 0; app.redraw(); }}>${m === "subject" ? "📊 과목별 보기" : "🏫 학급별 보기"}</button>`)}</div>
    <select class="sel" style="width:auto" aria-label="보기 대상" @change=${(e: Event) => { v.pick = Number((e.target as HTMLSelectElement).value); app.redraw(); }}>
      ${opts.length ? opts.map((o) => html`<option value=${String(o.id)} ?selected=${o.id === v.pick}>${o.name}</option>`) : html`<option>데이터 없음</option>`}</select>
    <div class="sp"></div>${saving.size ? html`<span class="chip warn">저장 중…</span>` : html`<span class="chip ok">✓ 저장됨</span>`}</div>`;
  const grid = !weeks.length || !cols.length || !v.pick
    ? html`<div class="card"><div class="empty">${!cols.length || !opts.length ? `${cat} 과목이나 반이 없습니다. 설정에서 먼저 넣으세요.` : `주차가 없습니다. ${ed ? "‘+ 주차 추가’를 누르세요." : ""}`}</div></div>`
    : html`<div class="gridwrap"><table class="g plan"><thead><tr><th class="fx" style="left:0;min-width:90px">주차</th>${cols.map((c) => html`<th style="min-width:170px">${c.name}</th>`)}</tr></thead>
      <tbody>${weeks.map((w) => html`<tr><td class="fx ${ed ? "click" : ""}" style="left:0" @click=${() => ed && editWeek(app, cat, w)}><b>${w.label}</b></td>
        ${cols.map((c) => {
          const [s, k] = sc(c.id);
          const cur = find(w.id, s, k);
          const busy = saving.has(key(w.id, s, k));
          return html`<td class="txt ${cur?.important ? "imp" : ""} ${busy ? "saving" : ""}">
            <textarea aria-label=${`${w.label} ${c.name}`} ?readonly=${!ed} .value=${live(cur?.content ?? "")}
              @change=${(e: Event) => saveCell(app, w, s, k, { content: (e.target as HTMLTextAreaElement).value })}></textarea>
            ${ed ? html`<button class="star ${cur?.important ? "on" : ""}" title="중요 표시" aria-label="중요 표시"
              @click=${() => saveCell(app, w, s, k, { toggleStar: true })}>★</button>` : nothing}</td>`;
        })}</tr>`)}</tbody></table></div>`;
  return html`${head({ crumb: "수업 › 진도", title: `진도 ${cat}`, chips: html`<span class="chip">${weeks.length}주</span>`,
    actions: ed ? html`<button class="btn pri" @click=${() => editWeek(app, cat, null)}>+ 주차 추가</button>` : undefined })}
  <div class="content">${controls}${grid}<div class="note" style="margin-top:8px">칸에 쓰고 다른 곳을 누르면 그 칸만 저장됩니다. 주차 이름을 누르면 바꾸거나 지울 수 있습니다.</div></div>`;
}
