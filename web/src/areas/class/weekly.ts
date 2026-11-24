// 수업 › 평가 › 성적 입력: 시간표 상세의 칸 하나(회차 × 반) = 입력표 한 장.
// 칸을 바꾸면 그 칸만 바로 저장한다(다른 선생님이 같은 반을 동시에 넣어도 서로 덮지 않음).
// 주소: #/weiz/class/<학기>/input/<회차 id>/<반 id>
import { html, nothing, type TemplateResult } from "lit-html";
import { api } from "../../shared/core/api";
import { go } from "../../shared/core/route";
import { errMsg, toast } from "../../shared/ui/ui";
import type { App } from "../../shell/app";
import { can } from "../../shell/app";
import { head } from "../../shell/layout";
import { className, dlabel, S, type Session, staffName, subjName, today } from "./state";

interface Info { on_date: string; start_t: string; end_t: string; week_label: string; mock: boolean; mock_max: number | null; subject: string | null; category: string | null; staff: string | null; staff_email: string | null; class_name: string }
interface Rec { student_id: string; att: string | null; book: boolean | null; beh: number | null; nt: number | null; hw: string | null; act: number | null; test: number | null; mock: number | null; ver: number; updated_by: string }
interface Sheet { info: Info; students: { student_id: string; name: string; name_no: number }[]; records: Rec[] }
type Field = "att" | "book" | "beh" | "nt" | "hw" | "act" | "test" | "mock";

const W = { key: "", sheet: null as Sheet | null, err: "", saved: "" };
/** 입력 현황 화면이 다시 불러오도록 알리는 표시(저장할 때마다 바뀜) */
export const weeklyDirty = { n: 0 };

const cellKey = (sid: number, cid: number) => `${S.termId}:${sid}:${cid}`;
const sessions = (): Session[] => (S.term?.sessions ?? []).filter((s) => s.kind === "class" && s.cells.length);

/** 처음 들어오면: 내가 맡은 칸 중 오늘 이전 가장 최근 → 아무 칸 중 가장 최근 → 첫 회차 */
function defaultCell(app: App): [number, number] | null {
  const ss = sessions();
  if (!ss.length) return null;
  const now = today();
  const past = ss.filter((s) => s.on_date <= now).reverse();
  const mine = (S.meta?.staff ?? []).find((x) => x.email && x.email === app.me.user.email)?.id;
  for (const s of past) { const c = s.cells.find((x) => mine && x.staff_id === mine); if (c) return [s.id, c.class_id]; }
  const s = past[0] ?? ss[0];
  return [s.id, s.cells[0].class_id];
}

async function load(app: App, sid: number, cid: number): Promise<void> {
  const k = cellKey(sid, cid);
  W.key = k; W.sheet = null; W.err = ""; W.saved = "";
  try {
    const d = await api<Sheet>("weeklySheet", { session_id: sid, class_id: cid });
    if (W.key === k) W.sheet = d;
  } catch (e) { if (W.key === k) W.err = errMsg(e); }
  app.redraw();
}

async function save(app: App, sid: number, cid: number, st: string, f: Field, raw: unknown): Promise<void> {
  const value = raw === "" ? null : raw;
  try {
    const r = await api<{ ver: number; value: unknown }>("recordSave", { session_id: sid, class_id: cid, student_id: st, field: f, value });
    const sh = W.sheet!;
    let rec = sh.records.find((x) => x.student_id === st);
    if (!rec) { rec = { student_id: st, att: null, book: null, beh: null, nt: null, hw: null, act: null, test: null, mock: null, ver: 0, updated_by: "" }; sh.records.push(rec); }
    Object.assign(rec, { [f]: r.value, ver: r.ver });
    W.saved = `저장됨 ${new Date().toTimeString().slice(0, 5)}`;
    weeklyDirty.n++;
  } catch (e) {
    toast(errMsg(e), "bad");
    await load(app, sid, cid); // 화면 값을 서버 값으로 되돌림
    return;
  }
  app.redraw();
}

async function sheetCall(app: App, action: string, body: Record<string, unknown>, okMsg: string): Promise<void> {
  try { W.sheet = await api<Sheet>(action, body); weeklyDirty.n++; toast(okMsg, "ok"); } catch (e) { toast(errMsg(e), "bad"); }
  app.redraw();
}

export function inputMain(app: App, sidPart?: string, cidPart?: string): TemplateResult {
  const sid = Number(sidPart) || 0, cid = Number(cidPart) || 0;
  const ss = sessions();
  const sess = ss.find((s) => s.id === sid);
  if (!sess || !sess.cells.some((c) => c.class_id === cid)) {
    const d = defaultCell(app);
    if (d) { go(app.ws, "class", String(S.termId), "input", String(d[0]), String(d[1])); return html`<div class="loading">불러오는 중…</div>`; }
    return html`${head({ crumb: "수업 › 평가", title: "성적 입력" })}<div class="content"><div class="card"><div class="empty">이 학기에 수업 회차가 없습니다. 시간표 상세에 회차를 먼저 만드세요.</div></div></div>`;
  }
  if (W.key !== cellKey(sid, cid)) void load(app, sid, cid);
  const ed = can(app, "scores_weekly", "editor");
  const pick = (s: number, c: number) => go(app.ws, "class", String(S.termId), "input", String(s), String(c));
  const i = ss.indexOf(sess);
  const bar = html`<div class="pickbar">
    <button class="btn sm" ?disabled=${i <= 0} @click=${() => { const p = ss[i - 1]; pick(p.id, p.cells.find((c) => c.class_id === cid)?.class_id ?? p.cells[0].class_id); }} aria-label="이전 회차">◀</button>
    <select class="sel" style="width:auto" aria-label="회차" @change=${(e: Event) => { const p = ss.find((x) => x.id === Number((e.target as HTMLSelectElement).value))!; pick(p.id, p.cells.find((c) => c.class_id === cid)?.class_id ?? p.cells[0].class_id); }}>
      ${ss.map((s) => html`<option value=${String(s.id)} ?selected=${s.id === sid}>${s.week_label ? `${s.week_label} · ` : ""}${dlabel(s.on_date)} ${s.start_t}${s.mock ? " · 모의" : ""}</option>`)}</select>
    <button class="btn sm" ?disabled=${i >= ss.length - 1} @click=${() => { const p = ss[i + 1]; pick(p.id, p.cells.find((c) => c.class_id === cid)?.class_id ?? p.cells[0].class_id); }} aria-label="다음 회차">▶</button>
    <div class="seg" role="tablist" aria-label="반">${sess.cells.map((c) => html`<button role="tab" class=${c.class_id === cid ? "on" : ""} @click=${() => pick(sid, c.class_id)}
      title=${`${subjName(c.subject_id)} ${staffName(c.staff_id)}`}>${className(c.class_id)}</button>`)}</div>
  </div>`;
  const sh = W.sheet;
  const inf = sh?.info;
  return html`${head({ crumb: "수업 › 평가", title: "성적 입력",
    chips: inf ? html`<span class="chip">${dlabel(inf.on_date)} ${inf.start_t}~${inf.end_t}</span><span class="chip info">${inf.class_name}</span>
      ${inf.subject ? html`<span class="chip">${inf.subject}</span>` : nothing}${inf.staff ? html`<span class="chip">${inf.staff}</span>` : nothing}
      ${inf.mock ? html`<span class="chip warn">모의고사 회차</span>` : nothing}${W.saved ? html`<span class="note">${W.saved}</span>` : nothing}` : undefined,
    actions: ed && sh ? html`<button class="btn" @click=${() => void sheetCall(app, "recordsAllPresent", { session_id: sid, class_id: cid }, "빈 출결을 모두 출석으로 넣었습니다.")}>모두 출석</button>` : undefined })}
  <div class="content">${bar}${W.err ? html`<div class="card"><div class="empty">${W.err}</div></div>`
    : !sh ? html`<div class="loading">불러오는 중…</div>` : grid(app, sh, sid, cid, ed)}</div>`;
}

function grid(app: App, sh: Sheet, sid: number, cid: number, ed: boolean): TemplateResult {
  const inf = sh.info;
  const byId = new Map(sh.records.map((r) => [r.student_id, r]));
  const sv = (st: string, f: Field) => (e: Event) => {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    const v = el instanceof HTMLInputElement && el.type === "checkbox" ? el.checked : el.value.trim();
    void save(app, sid, cid, st, f, v);
  };
  const num = (st: string, f: Field, v: number | null, max: number, step = "1") => html`<td class="inp"><input type="number" min="0" max=${String(max)} step=${step}
    inputmode="decimal" .value=${v == null ? "" : String(v)} ?disabled=${!ed} @change=${sv(st, f)} aria-label=${f}></td>`;
  const noteLab = inf.category === "과학" ? "이론노트 미흡" : "오답노트 미흡";
  const done = sh.records.filter((r) => r.att || r.hw || r.test != null || r.mock != null).length;
  return html`
  ${inf.mock ? html`<div class="note" style="margin:0 0 8px;display:flex;gap:8px;align-items:center">모의고사 만점
    <input class="sel" style="width:90px" type="number" min="1" step="0.5" .value=${inf.mock_max == null ? "" : String(inf.mock_max)} ?disabled=${!ed}
      @change=${(e: Event) => void sheetCall(app, "cellMockMax", { session_id: sid, class_id: cid, mock_max: (e.target as HTMLInputElement).value }, "만점을 저장했습니다.")}>
    <span>원점수를 넣으면 평가 때 (원점수 ÷ 만점 × 100)으로 바꿉니다.${inf.mock_max == null ? " 만점을 먼저 넣으세요." : ""}</span></div>` : nothing}
  ${sh.students.length ? html`<div class="gridwrap"><table class="g wk">
    <thead><tr><th class="fx" style="left:0;min-width:110px">학생</th><th>출결</th><th>교재<br>미지참</th><th>태도<br>지적</th><th title=${noteLab}>${noteLab.split(" ")[0]}<br>미흡</th>
      <th>과제</th><th>발표</th><th>위클리<br>테스트</th>${inf.mock ? html`<th>모의<br>원점수</th>` : nothing}</tr></thead>
    <tbody>${sh.students.map((st) => {
      const r = byId.get(st.student_id);
      const id = st.student_id;
      return html`<tr class=${r?.att === "결석" ? "abs" : ""}>
        <td class="fx" style="left:0"><b>${st.name}</b>${st.name_no > 1 ? html`<small class="note"> (${st.name_no})</small>` : nothing}</td>
        <td class="inp sel3"><select ?disabled=${!ed} @change=${sv(id, "att")} aria-label="출결">${["", "출석", "지각", "결석"].map((o) => html`<option value=${o} ?selected=${(r?.att ?? "") === o}>${o || "—"}</option>`)}</select></td>
        <td class="c"><input type="checkbox" .checked=${r?.book === true} ?disabled=${!ed} @change=${sv(id, "book")} aria-label="교재 미지참"></td>
        ${num(id, "beh", r?.beh ?? null, 50)}${num(id, "nt", r?.nt ?? null, 50)}
        <td class="inp sel3"><select ?disabled=${!ed} @change=${sv(id, "hw")} aria-label="과제">${["", "A", "B", "C", "D"].map((o) => html`<option value=${o} ?selected=${(r?.hw ?? "") === o}>${o || "—"}</option>`)}</select></td>
        ${num(id, "act", r?.act ?? null, 50)}${num(id, "test", r?.test ?? null, 100, "0.1")}
        ${inf.mock ? num(id, "mock", r?.mock ?? null, inf.mock_max ?? 1000, "0.1") : nothing}
      </tr>`;
    })}</tbody></table></div>
    <div class="note" style="margin-top:8px">${done}/${sh.students.length}명 입력. 칸을 바꾸면 바로 저장됩니다. 태도 지적·노트 미흡·발표는 횟수, 위클리테스트는 100점 기준.
      ${ed ? "" : " (보기 전용 — 입력 권한이 없습니다.)"}</div>`
    : html`<div class="card"><div class="empty">${inf.class_name}에 배정된 수강생이 없습니다. 학생·반편성에서 반을 정하세요.</div></div>`}`;
}
