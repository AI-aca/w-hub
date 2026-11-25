// 수업 › 평가 › 과목 경보: 저장된 기록으로 회차마다 자동 계산(서버 lib/weekly_alerts.ts, 참고사이트 computeAlerts 와 같은 규칙).
// 교사별(로그인한 강사가 기본) · 반별(담임) · 전체 현황(관리 권한). 조치 기록을 남기면 상태가 바뀐다. 성적 입력 화면에도 이번 회 경보를 띄운다.
import { html, nothing, type TemplateResult } from "lit-html";
import { api } from "../../shared/core/api";
import { href } from "../../shared/core/route";
import { errMsg, toast } from "../../shared/ui/ui";
import type { App } from "../../shell/app";
import { can } from "../../shell/app";
import { head } from "../../shell/layout";
import { type Fu, fuDirty, fuForm, logLines, md } from "./followup";
import { classes, className, S, staffName, subjName, subjects } from "./state";
import { weeklyDirty } from "./weekly";
const ver = () => `${weeklyDirty.n}:${fuDirty.n}`;

export interface Alert {
  id: string; student_id: string; name: string; class_id: number; subject_id: number; staff_id: string | null; week: number; week_label: string;
  date: string; due: string; rs: { t: string; x: string }[]; st: "wait" | "over" | "done" | "late"; days: number | null; left: number | null; logs: Fu[];
}
interface Cfg { drop: number; gap: number; rep: number; days: number }
interface Resp { alerts: Alert[]; cfg: Cfg; today: string; assign: { class_id: number; subject_id: number; staff_id: string }[]; me_staff: string | null }

const A = { key: "", dirty: "", data: null as Resp | null, err: "", mode: "t" as "t" | "c" | "a", t: null as string | null, c: 0, f: "open" as "open" | "done" | "all", open: "" };
export const isOpen = (a: Alert) => a.st === "wait" || a.st === "over";

async function load(app: App, key: string): Promise<void> {
  A.key = key; A.dirty = ver(); A.err = "";
  try { const d = await api<Resp>("alertsTerm", { term_id: S.termId }); if (A.key === key) A.data = d; }
  catch (e) { if (A.key === key) A.err = errMsg(e); }
  app.redraw();
}
function ensure(app: App): Resp | null {
  const key = String(S.termId);
  if (A.key !== key) A.data = null;
  if (A.key !== key || A.dirty !== ver()) void load(app, key);
  return A.data;
}
const mine = (d: Resp) => d.me_staff && d.assign.some((x) => x.staff_id === d.me_staff) ? d.me_staff : null;

/** 왼쪽 메뉴 숫자: 내 담당(강사 계정이면) 또는 전체의 처리할 경보 수 */
export function alertBadge(app: App): string {
  if (!S.termId || !can(app, "scores_weekly", "viewer")) return "";
  const d = ensure(app);
  if (!d) return "";
  const me = mine(d);
  const n = d.alerts.filter((a) => isOpen(a) && (!me || a.staff_id === me)).length;
  return n ? String(n) : "";
}

export const stChip = (a: Alert) => a.st === "wait" ? html`<span class="chip info">대응 대기 · D-${Math.max(0, a.left ?? 0)}</span>`
  : a.st === "over" ? html`<span class="chip bad">기한 경과 +${-(a.left ?? 0)}일</span>`
  : a.st === "done" ? html`<span class="chip ok">조치 완료 · ${a.days}일</span>` : html`<span class="chip warn">늦은 조치 · ${a.days}일</span>`;
export const reasons = (a: Alert) => html`<div class="al-rs">${a.rs.map((r) => html`<span class="al-r al-${r.t}">${r.x}</span>`)}</div>`;

function stats(L: Alert[]) {
  const done = L.filter((a) => !isOpen(a)), inT = done.filter((a) => a.st === "done"), judged = L.filter((a) => a.st !== "wait").length;
  const days = done.map((a) => a.days ?? 0);
  return { n: L.length, open: L.filter(isOpen).length, over: L.filter((a) => a.st === "over").length, wait: L.filter((a) => a.st === "wait").length,
    done: done.length, rate: done.length && judged ? inT.length / judged * 100 : null, avg: days.length ? days.reduce((x, y) => x + y, 0) / days.length : null };
}
const tiles = (s: ReturnType<typeof stats>, cfg: Cfg) => html`<div class="kpis">
  <div class="kpi"><div class="k">처리할 경보</div><div class="v" style=${s.open ? "color:var(--bad)" : ""}>${s.open}<small>건</small></div><div class="s">대응 대기 ${s.wait} · 기한 경과 ${s.over}</div></div>
  <div class="kpi"><div class="k">조치 완료</div><div class="v">${s.done}<small>/ ${s.n}건</small></div><div class="s">늦은 조치 포함</div></div>
  <div class="kpi"><div class="k">기한 내 대응률</div><div class="v">${s.rate == null ? "-" : s.rate.toFixed(0)}<small>%</small></div><div class="s">기한 ${cfg.days}일 안에 조치 기록</div></div>
  <div class="kpi"><div class="k">평균 대응 일수</div><div class="v">${s.avg == null ? "-" : s.avg.toFixed(1)}<small>일</small></div><div class="s">경보 뒤 첫 조치까지</div></div></div>`;

function summary(L: Alert[], title: string, today: string): string {
  const O = L.filter(isOpen);
  return `[과목 경보] ${title} · 처리할 경보 ${O.length}건 (${md(today)} 기준)\n` + O.map((a) =>
    `- ${md(a.date)} ${className(a.class_id)} ${a.name} ${subjName(a.subject_id)}: ${a.rs.map((r) => r.x).join(", ")} [${a.st === "over" ? "기한 경과" : `D-${Math.max(0, a.left ?? 0)}`}]`).join("\n");
}
async function copy(text: string): Promise<void> {
  try { await navigator.clipboard.writeText(text); toast("경보 요약을 복사했습니다. 메신저에 붙여넣으세요.", "ok"); }
  catch { toast("복사하지 못했습니다. 브라우저 권한을 확인하세요.", "bad"); }
}

function table(app: App, L: Alert[], showT: boolean): TemplateResult {
  if (!L.length) return html`<div class="card"><div class="empty">해당하는 경보가 없습니다.</div></div>`;
  const ed = can(app, "scores_weekly", "editor");
  const after = () => { A.dirty = ""; A.open = ""; app.redraw(); };
  return html`<div class="card" style="overflow:auto"><table class="t fu"><thead><tr><th>회차</th><th>학생</th><th>과목</th><th>경보 사유</th><th class="c">상태</th><th>조치 기록</th><th></th></tr></thead>
    <tbody>${L.map((a) => html`<tr class=${a.st === "over" ? "warnrow" : ""}>
      <td style="white-space:nowrap"><b>${md(a.date)}</b> <span class="note">${a.week_label === a.date ? `${a.week}회` : a.week_label}</span></td>
      <td style="white-space:nowrap"><b>${a.name}</b> <span class="note">${className(a.class_id)}</span></td>
      <td style="white-space:nowrap">${subjName(a.subject_id)}${showT ? html` <span class="note">${staffName(a.staff_id)}</span>` : nothing}</td>
      <td>${reasons(a)}</td><td class="c">${stChip(a)}</td><td>${logLines(app, a.logs.slice(0, 2), after)}</td>
      <td class="c">${ed ? html`<button class="btn sm" @click=${() => { A.open = A.open === a.id ? "" : a.id; app.redraw(); }}>+ 조치</button>` : nothing}</td></tr>
      ${A.open === a.id ? fuForm({ student_id: a.student_id, subject_id: a.subject_id, staff_id: a.staff_id, from: a.date, alert_key: a.id, hint: "내용 (예: 오답 유형 보충 40분, 학부모 전화 15분)" }, 7,
        () => { A.open = ""; app.redraw(); }, after) : nothing}`)}</tbody></table></div>`;
}

export function alertsMain(app: App): TemplateResult {
  const d = ensure(app);
  const adm = can(app, "scores_weekly", "admin");
  if (A.mode === "a" && !adm) A.mode = "t";
  const modes: [typeof A.mode, string][] = [["t", "교사별"], ["c", "반별 (담임)"], ...(adm ? [["a", "전체 현황"] as [typeof A.mode, string]] : [])];
  const setMode = (m: typeof A.mode) => { A.mode = m; A.open = ""; app.redraw(); };
  const hd = head({ crumb: "수업 › 평가", title: "과목 경보",
    chips: html`<div class="seg" role="tablist" aria-label="보기">${modes.map(([v, l]) => html`<button role="tab" class=${A.mode === v ? "on" : ""} @click=${() => setMode(v)}>${l}</button>`)}</div>` });
  if (A.err) return html`${hd}<div class="content"><div class="card"><div class="empty">${A.err}</div></div></div>`;
  if (!d) return html`${hd}<div class="content"><div class="loading">계산 중…</div></div>`;
  const c = d.cfg;
  const rule = html`<p class="lead note">점수를 저장할 때마다 회차별로 자동 계산합니다. 경보 조건: 모의고사 반 평균 대비 위치가 직전 모의고사보다 ${c.drop}점 이상 내려가거나 반 평균보다 ${c.gap}점 이상 낮음(100점 환산, 시험 난이도 영향 제외)
    · 테스트 ${c.rep}회 연속 하락 · 과제 C·D ${c.rep}회 연속 · 노트 미흡 ${c.rep}회 연속 · 결석·지각 최근 3회 중 ${c.rep}회. 수업일부터 ${c.days}일 안에 조치 기록이 없으면 기한 경과로 바뀝니다.
    ${adm ? "경보 기준은 평가 설정에서 바꿉니다." : ""}</p>`;
  let L = d.alerts, title = "", bar: TemplateResult = html``;
  if (A.mode === "t") {
    const staffIds = [...new Set(d.assign.map((x) => x.staff_id))].sort((a, b) => staffName(a).localeCompare(staffName(b), "ko"));
    const T = A.t && staffIds.includes(A.t) ? A.t : mine(d);
    bar = html`<label class="note" style="display:flex;gap:6px;align-items:center;margin:0">교사<select class="sel" style="width:auto" aria-label="교사"
      @change=${(e: Event) => { A.t = (e.target as HTMLSelectElement).value || null; A.open = ""; app.redraw(); }}><option value="">선택</option>
      ${staffIds.map((id) => html`<option value=${id} ?selected=${id === T}>${staffName(id)}</option>`)}</select></label>`;
    L = T ? d.alerts.filter((a) => a.staff_id === T) : [];
    title = T ? staffName(T) : "";
    if (!T) return html`${hd}<div class="content"><div class="pickbar">${bar}</div>${rule}<div class="card"><div class="empty">교사를 고르면 담당 반·과목 경보만 모아 보여 줍니다. 강사 계정과 연결된 선생님은 자동으로 고릅니다.</div></div></div>`;
  } else if (A.mode === "c") {
    const cls = classes();
    const k = cls.find((x) => x.id === A.c) ?? cls[0];
    if (!k) return html`${hd}<div class="content"><div class="empty">반이 없습니다.</div></div>`;
    const hr = staffName(k.homeroom_staff_id) || "미정";
    bar = html`<div class="seg" role="tablist" aria-label="반">${cls.map((x) => html`<button role="tab" class=${x.id === k.id ? "on" : ""} @click=${() => { A.c = x.id; A.open = ""; app.redraw(); }}>${x.name}</button>`)}</div>
      <span class="note">담임 ${hr}</span>`;
    L = d.alerts.filter((a) => a.class_id === k.id);
    title = `${k.name} (담임 ${hr})`;
  } else return html`${hd}<div class="content">${overall(app, d, rule)}</div>`;
  const s = stats(L);
  const filt = A.f === "open" ? L.filter(isOpen) : A.f === "done" ? L.filter((a) => !isOpen(a)) : L;
  return html`${hd}<div class="content"><div class="pickbar">${bar}<span style="flex:1"></span>
      <button class="btn" ?disabled=${!L.some(isOpen)} @click=${() => copy(summary(L, title, d.today))}>📋 경보 요약 복사</button></div>
    ${rule}${tiles(s, c)}
    <div class="pickbar"><div class="seg" role="tablist" aria-label="상태">${([["open", `처리할 경보 ${s.open}`], ["done", `조치 완료 ${s.done}`], ["all", `전체 ${s.n}`]] as [typeof A.f, string][])
      .map(([v, l]) => html`<button role="tab" class=${A.f === v ? "on" : ""} @click=${() => { A.f = v; app.redraw(); }}>${l}</button>`)}</div></div>
    ${table(app, filt, A.mode === "c")}</div>`;
}

function overall(app: App, d: Resp, rule: TemplateResult): TemplateResult {
  const all = d.alerts, s = stats(all);
  const staffIds = [...new Set(d.assign.map((x) => x.staff_id))].sort((a, b) => staffName(a).localeCompare(staffName(b), "ko"));
  const subs = subjects().filter((x) => all.some((a) => a.subject_id === x.id) || d.assign.some((y) => y.subject_id === x.id));
  const open = all.filter(isOpen).sort((a, b) => (a.st === "over" ? 0 : 1) - (b.st === "over" ? 0 : 1) || a.due.localeCompare(b.due));
  return html`<div class="pickbar"><span style="flex:1"></span><button class="btn" ?disabled=${!open.length} @click=${() => copy(summary(all, "전체", d.today))}>📋 전체 요약 복사</button></div>
  ${rule}${tiles(s, d.cfg)}
  <div class="card" style="margin-bottom:12px;overflow:auto"><div class="ch"><b>교사별 대응 현황</b><span class="note">줄을 누르면 그 교사의 경보 목록</span></div>
    <table class="t"><thead><tr><th>교사</th><th>담당</th><th class="num">경보</th><th class="num">대응 대기</th><th class="num">기한 경과</th><th class="num">조치 완료</th><th class="num">기한 내 대응률</th><th class="num">평균 대응</th></tr></thead>
    <tbody>${staffIds.map((id) => { const t = stats(all.filter((a) => a.staff_id === id)); return html`<tr class="click ${t.over ? "warnrow" : ""}" @click=${() => { A.t = id; A.mode = "t"; A.f = "open"; app.redraw(); }}>
      <td><b>${staffName(id)}</b></td><td>${d.assign.filter((x) => x.staff_id === id).map((x) => `${className(x.class_id)} ${subjName(x.subject_id)}`).join(" · ")}</td>
      <td class="num">${t.n}</td><td class="num">${t.wait}</td><td class="num" style=${t.over ? "color:var(--bad);font-weight:800" : ""}>${t.over}</td><td class="num">${t.done}</td>
      <td class="num">${t.rate == null ? "-" : t.rate.toFixed(0) + "%"}</td><td class="num">${t.avg == null ? "-" : t.avg.toFixed(1) + "일"}</td></tr>`; })}</tbody></table></div>
  <div class="card" style="margin-bottom:12px;overflow:auto"><div class="ch"><b>과목·반별 경보 수</b><span class="note">학기 전체 · 괄호는 지금 처리할 경보</span></div>
    <table class="t"><thead><tr><th>반</th>${subs.map((x) => html`<th class="c">${x.name}</th>`)}<th class="c">합계</th></tr></thead>
    <tbody>${classes().map((k) => { const r = all.filter((a) => a.class_id === k.id); return html`<tr><td><b>${k.name}</b></td>${subs.map((x) => {
      const q = r.filter((a) => a.subject_id === x.id), o = q.filter(isOpen).length;
      return html`<td class="c">${q.length}${o ? html` <b style="color:var(--bad)">(${o})</b>` : nothing}</td>`; })}<td class="c"><b>${r.length}</b></td></tr>`; })}</tbody></table></div>
  <h3 style="margin:16px 0 8px">지금 처리할 경보 <span class="note">기한 경과 먼저</span></h3>${table(app, open, true)}`;
}

/** 성적 입력 화면: 고른 칸(회차 × 반)의 이번 회 그 과목 경보 */
const IN = { cell: "", key: "", list: [] as Alert[] };
export function inputAlerts(app: App, sid: number, cid: number, dirty: number): TemplateResult {
  const cell = `${S.termId}:${sid}:${cid}`, key = `${cell}:${dirty}`;
  if (IN.cell !== cell) { IN.cell = cell; IN.list = []; }
  if (IN.key !== key) {
    IN.key = key;
    void api<Resp>("alertsTerm", { term_id: S.termId, session_id: sid, class_id: cid })
      .then((d) => { if (IN.key === key) { IN.list = d.alerts; app.redraw(); } }).catch(() => { /* 경보는 보조 정보: 실패해도 입력은 계속 */ });
  }
  const L = IN.list;
  if (!L.length) return html``;
  return html`<div class="callout warn al-in"><b>🔔 이번 회 ${subjName(L[0].subject_id)} 경보 ${L.length}명</b>
    ${L.map((a) => html`<span class="al-p"><b>${a.name}</b> ${a.rs.map((r) => r.x).join(", ")}</span>`)}
    <a class="btn sm" style="margin-left:auto" href=${href(app.ws, "class", String(S.termId), "alerts")}>조치 기록하러 가기</a></div>`;
}
