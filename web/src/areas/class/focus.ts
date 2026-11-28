// 수업 › 평가 › 집중관리: n차 리포트(모의 3n회까지) 성적 기준 대상 학생과 사후관리(조치) 기록. 참고사이트 집중관리 [반별]·[교사별].
// 반별 = 반마다 최종 종합 하위 5명(담임), 교사별 = 강사가 맡은 반·과목마다 과목 종합 하위 3명. 기록은 그 리포트 뒤 다음 리포트 전까지만 센다.
import { html, nothing, type TemplateResult } from "lit-html";
import { api } from "../../shared/core/api";
import { errMsg } from "../../shared/ui/ui";
import type { App } from "../../shell/app";
import { can } from "../../shell/app";
import { head } from "../../shell/layout";
import { f1, pvClass, sg } from "./evaltext";
import { type Fu, fuDirty, fuForm, logLines, md } from "./followup";
import { S, staffName, subjName } from "./state";
import { weeklyDirty } from "./weekly";
const ver = () => `${weeklyDirty.n}:${fuDirty.n}`;

interface Item { student_id: string; name: string; score: number; avg: number | null; weak?: number | null; weakScore?: number | null; cause?: string; hope1?: string; h1pv?: string | null; h1m?: number | null }
interface Win { k: number; upto: number; from: string; to: string; label: string }
interface FClass { id: number; name: string; homeroom_staff_id: string | null; n: number; focus: Item[]; subjects: { subject_id: number; staff_id: string; items: Item[] }[] }
interface Resp { wins: Win[]; k: number; win: Win; classes: FClass[]; follows: Fu[]; me_staff: string | null }

const F = { term: 0, key: "", dirty: "", data: null as Resp | null, err: "", k: null as number | null, mode: "class" as "class" | "teacher", t: null as string | null, open: "" };

async function load(app: App, key: string): Promise<void> {
  F.key = key; F.dirty = ver(); F.err = "";
  try { const d = await api<Resp>("focusData", { term_id: S.termId, k: F.k }); if (F.key === key) { F.data = d; F.k = d.k; F.key = `${S.termId}:${d.k}`; } }
  catch (e) { if (F.key === key) F.err = errMsg(e); }
  app.redraw();
}
const reload = (app: App) => { F.dirty = ""; app.redraw(); };

export function focusMain(app: App): TemplateResult {
  if (F.term !== S.termId) Object.assign(F, { term: S.termId, k: null, data: null, key: "", open: "" });
  const key = `${S.termId}:${F.k ?? ""}`;
  if (F.key !== key || F.dirty !== ver()) void load(app, key);
  const d = F.data;
  const mode = (m: "class" | "teacher") => { F.mode = m; F.open = ""; app.redraw(); };
  return html`${head({ crumb: "수업 › 평가", title: "집중관리",
    chips: html`<div class="seg" role="tablist" aria-label="보기"><button role="tab" class=${F.mode === "class" ? "on" : ""} @click=${() => mode("class")}>반별 (담임)</button>
      <button role="tab" class=${F.mode === "teacher" ? "on" : ""} @click=${() => mode("teacher")}>교사별</button></div>` })}
  <div class="content">${F.err ? html`<div class="card"><div class="empty">${F.err}</div></div>` : !d ? html`<div class="loading">계산 중…</div>` : html`
    <div class="pickbar"><div class="seg" role="tablist" aria-label="리포트">${d.wins.map((w) => html`<button role="tab" class=${w.k === d.k ? "on" : ""}
      @click=${() => { F.k = w.k; F.open = ""; app.redraw(); }}>${w.k ? `${w.k}차 리포트 후 (${w.label})` : "지금까지"}</button>`)}</div></div>
    ${d.win.k === 0 ? html`<p class="note">모의고사 회차가 3회 이상 정해지면(시간표 상세의 '모의' 표시) 리포트 기간(모의 3회마다)으로 나뉩니다. 지금은 학기 전체 성적·전체 기록으로 봅니다.</p>` : nothing}
    ${F.mode === "class" ? byClass(app, d) : byTeacher(app, d)}`}</div>`;
}

const scoreTd = (v: number, a: number | null) => html`<td class="num">${f1(v)} <span class="note">${a != null ? sg(v - a) : ""}</span></td>`;
const stChip = (n: number) => n ? html`<span class="chip ok">조치 ${n}건</span>` : html`<span class="chip bad">미조치</span>`;

function rows(app: App, d: Resp, items: Item[], extra: (r: Item) => TemplateResult, sub: number | null, who: string | null, cols: number, showCls = ""): TemplateResult[] {
  const ed = can(app, "scores_weekly", "editor");
  return items.map((r) => {
    const L = d.follows.filter((f) => f.student_id === r.student_id && (sub == null || f.subject_id === sub));
    const id = `${r.student_id}_${sub ?? "hr"}_${who ?? ""}`;
    return html`<tr><td style="white-space:nowrap"><b>${r.name}</b>${showCls ? html` <span class="note">${showCls}</span>` : nothing}</td>${scoreTd(r.score, r.avg)}${extra(r)}
      <td class="c">${stChip(L.length)}</td><td>${logLines(app, L, () => reload(app))}</td>
      <td class="c">${ed ? html`<button class="btn sm" @click=${() => { F.open = F.open === id ? "" : id; app.redraw(); }}>+ 기록</button>` : nothing}</td></tr>
      ${F.open === id ? fuForm({ student_id: r.student_id, subject_id: sub, staff_id: who, from: d.win.from, hint: "내용 (예: 오답 유형 보충 40분, 학부모 전화 상담 15분 등)" }, cols,
        () => { F.open = ""; app.redraw(); }, () => { F.open = ""; reload(app); }) : nothing}`;
  });
}

function byClass(app: App, d: Resp): TemplateResult {
  const w = d.win;
  return html`<p class="lead note">${w.k ? `${w.k}차 리포트(모의고사 ${3 * w.k}회까지)` : "지금까지의"} 성적 기준 최종 종합점수 하위 5명입니다. 담임 선생님은 반 전체 흐름을 보고, 과목 선생님들의 사후관리 기록을 한곳에서 확인합니다.
    ${w.k ? `조치 기록은 ${w.label} 사이의 기록만 셉니다.` : "조치 기록은 학기 전체 기록을 셉니다."}</p>
  ${d.classes.map((c) => {
    const done = c.focus.filter((r) => d.follows.some((f) => f.student_id === r.student_id)).length;
    return html`<div class="card" style="margin-bottom:12px"><div class="ch"><b>${c.name} 집중관리 대상</b>
      <span class="note">담임 ${staffName(c.homeroom_staff_id) || "미정(설정에서 정함)"} · 조치 ${done} / ${c.focus.length}명</span></div>
      ${c.focus.length ? html`<div style="overflow:auto"><table class="t fu"><thead><tr><th>학생</th><th class="num">최종 (반 평균 대비)</th><th>취약 과목</th><th>1지망 판단</th><th class="c">상태</th><th>사후관리 기록 (모든 교사)</th><th></th></tr></thead>
        <tbody>${rows(app, d, c.focus, (r) => html`<td>${subjName(r.weak ?? null)} <span class="note">${f1(r.weakScore ?? null)}</span></td>
          <td style="white-space:nowrap">${r.h1pv ? html`<span class="chip ${pvClass(r.h1pv)}">${r.h1pv}</span> <span class="note">${r.hope1}</span>` : html`<span class="note">-</span>`}</td>`, null, c.homeroom_staff_id, 7)}</tbody></table></div>`
        : html`<div class="cb note">${c.n ? "" : "성적 기록이 있는 학생이 없습니다."}</div>`}</div>`;
  })}`;
}

interface T { staff_id: string; lists: { cls: FClass; subject_id: number; items: Item[] }[] }
function teachers(d: Resp): T[] {
  const m = new Map<string, T>();
  for (const c of d.classes) for (const s of c.subjects) {
    const t = m.get(s.staff_id) ?? { staff_id: s.staff_id, lists: [] };
    m.set(s.staff_id, t);
    t.lists.push({ cls: c, subject_id: s.subject_id, items: s.items });
  }
  return [...m.values()].sort((a, b) => staffName(a.staff_id).localeCompare(staffName(b.staff_id), "ko"));
}

function byTeacher(app: App, d: Resp): TemplateResult {
  const TS = teachers(d), w = d.win;
  if (!TS.length) return html`<div class="card"><div class="empty">시간표 상세 칸에 담당 강사가 정해지면 교사별 대상이 나옵니다.</div></div>`;
  const logsOf = (sid: string, sub: number) => d.follows.filter((f) => f.student_id === sid && f.subject_id === sub);
  const stat = (t: T) => {
    let n = 0, done = 0, logs = 0, last = "";
    for (const l of t.lists) for (const r of l.items) { n++; const L = logsOf(r.student_id, l.subject_id); if (L.length) done++; logs += L.length; for (const f of L) if (f.on_date > last) last = f.on_date; }
    return { n, done, pend: n - done, logs, last };
  };
  const cur = TS.find((t) => t.staff_id === F.t) ?? TS.find((t) => t.staff_id === d.me_staff) ?? TS[0];
  const pick = (id: string) => { F.t = id; F.open = ""; app.redraw(); };
  return html`<p class="lead note">교사마다 맡은 반·과목에서 그 과목 종합점수 하위 3명이 집중관리 대상입니다. ${w.k ? `${w.k}차 리포트 뒤 ${w.label} 사이에` : "학기 중"} 보충수업·상담 기록이 없으면 미조치로 표시됩니다.</p>
  <div class="card" style="margin-bottom:12px;overflow:auto"><div class="ch"><b>교사별 사후관리 현황</b><span class="note">줄을 누르면 그 교사의 대상 학생</span></div>
    <table class="t"><thead><tr><th>교사</th><th>담당</th><th class="num">대상</th><th class="num">조치 완료</th><th class="num">미조치</th><th class="num">기록 건수</th><th>마지막 기록</th><th>상태</th></tr></thead>
    <tbody>${TS.map((t) => { const s = stat(t); return html`<tr class="click ${t.staff_id === cur.staff_id ? "pick" : ""}" @click=${() => pick(t.staff_id)}>
      <td><b>${staffName(t.staff_id)}</b></td><td>${t.lists.map((l) => `${l.cls.name} ${subjName(l.subject_id)}`).join(" · ")}</td><td class="num">${s.n}</td><td class="num">${s.done}</td>
      <td class="num" style=${s.pend ? "color:var(--bad);font-weight:800" : ""}>${s.pend}</td><td class="num">${s.logs}</td><td>${s.last ? md(s.last) : "-"}</td>
      <td>${s.pend ? html`<span class="chip bad">미조치 ${s.pend}명</span>` : html`<span class="chip ok">모두 조치</span>`}</td></tr>`; })}</tbody></table></div>
  <div class="seg" role="tablist" aria-label="교사" style="margin-bottom:10px;flex-wrap:wrap">${TS.map((t) => html`<button role="tab" class=${t.staff_id === cur.staff_id ? "on" : ""} @click=${() => pick(t.staff_id)}>${staffName(t.staff_id)}</button>`)}</div>
  ${cur.lists.map((l) => {
    const done = l.items.filter((r) => logsOf(r.student_id, l.subject_id).length).length;
    return html`<div class="card" style="margin-bottom:12px"><div class="ch"><b>${l.cls.name} ${subjName(l.subject_id)}</b>
      <span class="note">${staffName(cur.staff_id)} · 과목 종합 하위 3명 · 조치 ${done} / ${l.items.length}명</span></div>
      ${l.items.length ? html`<div style="overflow:auto"><table class="t fu"><thead><tr><th>학생</th><th class="num">${subjName(l.subject_id)} 종합 (반 평균 대비)</th><th>낮은 항목</th><th class="c">상태</th><th>사후관리 기록</th><th></th></tr></thead>
        <tbody>${rows(app, d, l.items, (r) => html`<td>${r.cause}</td>`, l.subject_id, cur.staff_id, 6)}</tbody></table></div>` : html`<div class="cb note">이 과목 성적이 아직 없습니다.</div>`}</div>`;
  })}`;
}
