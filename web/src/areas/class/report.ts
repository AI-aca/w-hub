// 수업 › 평가 › 학생 리포트: 차수(모의 3회마다)별 3쪽 리포트. 총평(고칠 수 있음)·모의 흐름·강점/보완·모의고사 성적표·지원 가능 학교·과목별 성취·학습 태도·사후관리 한 줄·실행 계획.
// 참고사이트 '학생 리포트'와 같은 구성·문안(서버 lib/weekly_report.ts 가 계산). 인쇄(PDF 로 저장)는 브라우저 인쇄 창을 쓴다.
// 주소: #/weiz/class/<학기>/report/<반 id>/<차수>
import { html, nothing, type TemplateResult } from "lit-html";
import { api } from "../../shared/core/api";
import { go } from "../../shared/core/route";
import { errMsg, toast } from "../../shared/ui/ui";
import type { App } from "../../shell/app";
import { can } from "../../shell/app";
import { head } from "../../shell/layout";
import { barsChart, trendFromSeries } from "./charts";
import { type Adm, f1, pvClass, sg } from "./evaltext";
import { track } from "./busy";
import { classes, S } from "./state";
import { weeklyDirty } from "./weekly";

interface MockCell { v: number | null; max: number | null; avg: number | null; pct: number | null }
interface MockTable { round: number; date: string; rows: { label: string; sum: boolean; c: MockCell }[]; conv: MockCell }
interface Plan { t: string; tag: string; a: string; h: string; goal: string }
interface Rep {
  student_id: string; name: string; rank: number; n: number; hope1: string; hope2: string;
  summary: { text: string; auto: string; saved: boolean };
  kpi: { l: string; v: number | null; c: number | null }[];
  chart: { rounds: number[]; from: number; to: number; me: { round: number; comp: number }[]; avg: { round: number; comp: number }[]; cut: { round: number; value: number }[] };
  chartNote: string; good: string[]; bad: string[]; mock: MockTable[]; adm: Adm[]; rec: { gname: string; pv: string | null } | null;
  bars: { name: string; v: number; avg: number | null }[];
  habit: { att: number | null; attAvg: number | null; hw: number | null; hwAvg: number | null; hwL: string; act: number; actAvg: number | null; test: number | null; testAvg: number | null; ntM: number; ntMAvg: number | null; ntS: number; ntSAvg: number | null };
  care: string | null; plan: Plan[]; hopeG: [number | null, number | null];
}
interface Win { k: number; upto: number; from: string; to: string; label: string }
interface Resp { wins: Win[]; k: number; win: Win | null; students: { student_id: string; name: string; has: boolean }[]; reports: Rep[]; groups: string[]; mockCount: number }

const R = { key: "", dirty: -1, data: null as Resp | null, err: "", sid: "", all: false };

async function load(app: App, key: string, classId: number, k: number): Promise<void> {
  const same = R.key === key; // 같은 반·차수를 다시 불러올 때는 지금 화면을 그대로 둔다
  R.key = key; R.dirty = weeklyDirty.n; if (!same) R.data = null; R.err = "";
  try { const d = await api<Resp>("reportData", { term_id: S.termId, class_id: classId, k }); if (R.key === key) R.data = d; }
  catch (e) { if (R.key === key) R.err = errMsg(e); }
  app.redraw();
}

function print(app: App, all: boolean): void {
  const cls = all ? "pr-all" : "pr-one";
  const done = () => { document.body.classList.remove("pr-all", "pr-one"); R.all = false; removeEventListener("afterprint", done); app.redraw(); };
  addEventListener("afterprint", done);
  R.all = all; app.redraw();
  document.body.classList.add(cls);
  window.print(); // redraw 는 바로 그리므로 인쇄 대상이 이미 화면에 있다
}

export function reportMain(app: App, cPart?: string, kPart?: string): TemplateResult {
  const cls = classes();
  const c = cls.find((x) => x.id === Number(cPart)) ?? cls[0];
  if (!c) return html`${head({ crumb: "수업 › 평가", title: "학생 리포트" })}<div class="content"><div class="empty">반이 없습니다.</div></div>`;
  const kq = Number(kPart) || 0;
  const key = `${S.termId}:${c.id}:${kq}`;
  if (R.key !== key || R.dirty !== weeklyDirty.n) void load(app, key, c.id, kq);
  const d = R.key === key ? R.data : null;
  const to = (cid: number, k = 0) => go(app.ws, "class", String(S.termId), "report", String(cid), ...(k ? [String(k)] : []));
  const sel = d ? d.reports.find((r) => r.student_id === R.sid) ?? d.reports[0] : undefined;
  if (sel) R.sid = sel.student_id;
  return html`${head({ crumb: "수업 › 평가", title: "학생 리포트",
    chips: html`<div class="seg" role="tablist" aria-label="반">${cls.map((x) => html`<button role="tab" class=${x.id === c.id ? "on" : ""} @click=${() => to(x.id, kq)}>${x.name}</button>`)}</div>`,
    actions: d?.reports.length ? html`<button class="btn" @click=${() => print(app, false)}>인쇄·PDF (이 학생)</button><button class="btn" @click=${() => print(app, true)}>반 전체 인쇄·PDF</button>` : undefined })}
  <div class="content">${R.err ? html`<div class="card"><div class="empty">${R.err}</div></div>` : !d ? html`<div class="loading">계산 중…</div>` : body(app, d, c.id, c.name, sel, to)}</div>`;
}

function body(app: App, d: Resp, classId: number, cname: string, sel: Rep | undefined, to: (cid: number, k?: number) => void): TemplateResult {
  if (!d.wins.length) return html`<div class="card"><div class="empty">리포트는 모의고사 회차가 3회 이상 정해지면(시간표 상세의 ‘모의’ 표시) 모의 3회마다 한 차수씩 만들어집니다. 지금 모의 회차는 ${d.mockCount}개입니다.</div></div>`;
  const w = d.win!, k = d.k;
  const ed = can(app, "scores_weekly", "editor");
  return html`<div class="pickbar no-print">
    <div class="seg" role="tablist" aria-label="차수">${d.wins.map((x) => html`<button role="tab" class=${x.k === k ? "on" : ""} @click=${() => to(classId, x.k)}>${x.k}차 (모의 ${3 * x.k - 2}~${3 * x.k}회)</button>`)}</div>
    <select class="sel" style="width:auto;min-width:160px" aria-label="학생" @change=${(e: Event) => { R.sid = (e.target as HTMLSelectElement).value; app.redraw(); }}>
      ${d.students.map((s) => html`<option value=${s.student_id} ?selected=${s.student_id === R.sid}>${s.name}${s.has ? "" : " (모의 성적 없음)"}</option>`)}</select>
    <span class="note">${k}차 리포트 = 모의 ${3 * k}회까지의 성적 기준 · 기간 ${w.label}</span></div>
  ${sel ? html`<div class="rp-one">${sheet(sel, cname, k, ed, () => app.redraw())}</div>`
    : html`<div class="card"><div class="empty">${d.students.length ? `모의고사 ${3 * k}회 성적이 입력되면 ${k}차 리포트가 만들어집니다.` : "이 반에 수강생이 없습니다."}</div></div>`}
  ${R.all ? html`<div class="rp-all">${d.reports.map((r) => sheet(r, cname, k, false, () => app.redraw()))}</div>` : nothing}`;
}

const kpiCls = (v: number | null, c: number | null) => v == null || c == null ? "" : v - c >= 0 ? "p" : "n";

function sheet(r: Rep, cname: string, k: number, editable: boolean, redraw: () => void): TemplateResult {
  const a = 3 * k - 2, b = 3 * k;
  const term = S.meta?.terms.find((t) => t.id === S.termId)?.name ?? "";
  const course = S.meta?.courses.find((x) => x.id === S.courseId)?.name ?? "";
  const hd = html`<div class="rp-head"><b>학습 성취 분석 리포트</b><span class="rp-logo"><span class="wlogo">W</span>와이즈만 <b>${course}</b></span></div>`;
  const ft = (p: number) => html`<div class="rp-foot"><span>WEIZMANN · ${course} ${term} 학습 성취 분석 리포트 · ${k}차</span><span>${p} / 3</span></div>`;
  const save = async (text: string, reset = false) => {
    try { await track(api("reportTextSave", { term_id: S.termId, student_id: r.student_id, k, body: reset ? "" : text })); if (reset) toast("자동 문안으로 되돌렸습니다.", "ok"); }
    catch (e) { toast(errMsg(e), "bad"); }
    weeklyDirty.n++; // 다시 불러와 '저장된 총평' 표시와 문안을 서버 값으로
    redraw();
  };
  const h = r.habit;
  return html`<div class="rp-sheet">
  <div class="rp-page">${hd}
    <div class="rp-id"><span class="namebox">${r.name}</span><span class="pill t">${cname}</span>
      <span class="pill">${term} · ${k}차 (모의고사 ${a}~${b}회)</span>${r.hope1 ? html`<span class="pill">1지망 ${r.hope1}</span>` : nothing}${r.hope2 ? html`<span class="pill">2지망 ${r.hope2}</span>` : nothing}</div>
    <div class="rp-sum">${editable
      ? html`<textarea rows="5" aria-label="총평" .value=${r.summary.text} @change=${(e: Event) => void save((e.target as HTMLTextAreaElement).value)}></textarea>
        <div class="rp-tools no-print"><span class="note">${r.summary.saved ? "저장된 총평 · 고치면 바로 저장" : "자동 문안 · 고치면 바로 저장"}</span>
          <button class="btn sm" @click=${() => void save("", true)}>자동 문안 다시 넣기</button></div>`
      : html`<p>${r.summary.text}</p>`}
      <div class="rp-kpi">${r.kpi.map((x) => html`<div><span>${x.l}</span><b>${f1(x.v)}</b> <em class=${kpiCls(x.v, x.c)}>${x.v != null && x.c != null ? sg(x.v - x.c) : ""}</em><small>반 평균 ${f1(x.c)}</small></div>`)}</div></div>
    <h3 class="rp-h"><span class="dot">1</span>모의고사 흐름 <small>환산 총점 200점 · 학생 / 반 평균 / 1지망 합격 안전선 · 연한 칸이 이번 기간</small></h3>
    <div class="rp-card">${trendFromSeries(r.name, r.chart)}</div>
    <div class="rp-call"><b>이 차트에서 보이는 것</b>${r.chartNote}</div>
    <div class="two rp-two"><div class="rp-box g"><b>이번 기간 강점</b><ul>${r.good.length ? r.good.map((x) => html`<li>${x}</li>`) : html`<li>반 평균 수준에서 고르게 유지</li>`}</ul></div>
      <div class="rp-box b"><b>보완할 점</b><ul>${r.bad.length ? r.bad.map((x) => html`<li>${x}</li>`) : html`<li>반 평균보다 크게 낮은 항목 없음</li>`}</ul></div></div>
    ${ft(1)}</div>
  <div class="rp-page">${hd}
    <h3 class="rp-h"><span class="dot">2</span>모의고사 성적표 <small>${a}~${b}회 · 과목별 원점수 · 평균 · 백분위</small></h3>
    ${mockTable(r.mock)}
    <h3 class="rp-h"><span class="dot">3</span>지원 가능 영재학교 <small>최근 모의고사 3회 · 우리 판단 ${r.rec ? `${r.rec.gname} (${r.rec.pv})` : "-"}</small></h3>
    ${admTable(r)}
    <p class="note">커트라인은 합격 안전선(합격률 80% 이상)입니다. 안전선에 못 미쳐도 합격할 수 있습니다. 안전: 안전선 이상 · 근접: −10점 이내 · 소신: −20점 이내 · 도전: 그 아래</p>
    <h3 class="rp-h"><span class="dot">4</span>과목별 성취 <small>과목 종합점수 · 점선 반 평균</small></h3>
    <div class="rp-card">${barsChart(r.bars)}</div>
    ${ft(2)}</div>
  <div class="rp-page">${hd}
    <h3 class="rp-h"><span class="dot">5</span>학습 태도 · 과제</h3>
    <table class="t rp-t"><thead><tr><th>출결 점수</th><th>과제 평균</th><th>발표</th><th>위클리테스트</th><th>오답노트 미흡</th><th>이론노트 미흡</th></tr></thead>
      <tbody><tr><td>${f1(h.att)} <span class="note">반 ${f1(h.attAvg)}</span></td><td>${h.hwL} <span class="note">${f1(h.hw)}점 · 반 ${f1(h.hwAvg)}</span></td>
        <td>${h.act}회 <span class="note">반 ${f1(h.actAvg)}회</span></td><td>${f1(h.test)} <span class="note">반 ${f1(h.testAvg)}</span></td>
        <td>${h.ntM}회 <span class="note">반 ${f1(h.ntMAvg)}회</span></td><td>${h.ntS}회 <span class="note">반 ${f1(h.ntSAvg)}회</span></td></tr></tbody></table>
    ${r.care ? html`<div class="rp-care"><b>학원 사후관리</b><span>${r.care}</span></div>` : nothing}
    <h3 class="rp-h"><span class="dot">6</span>다음 리포트까지 실행 계획 <small>학원에서 할 일 · 가정에서 함께해 주실 일</small></h3>
    <div class="plan">${r.plan.map((x, i) => html`<div class="pl"><span class="pn">${i + 1}</span><div class="pt"><b>${x.t}</b><span class="pill ${x.tag === "학원" ? "t" : ""}">${x.tag}</span></div>
      <div class="pd"><p><b>학원</b>${x.a}</p><p><b>가정</b>${x.h}</p></div><div class="pg"><span>목표</span>${x.goal}</div></div>`)}</div>
    ${ft(3)}</div></div>`;
}

function mockCell(c: MockCell, sum: boolean, conv = false): TemplateResult {
  if (c.v == null) return html`<td class="c" colspan="3">-</td>`;
  return html`<td class="num ${sum ? "b" : ""}" style=${conv ? "color:var(--accent)" : ""}>${conv ? f1(c.v) : c.v}<small>${c.max != null ? `/${c.max}` : ""}</small></td><td class="num">${f1(c.avg)}</td><td class="num pc">${c.pct ?? "-"}</td>`;
}
function mockTable(ms: MockTable[]): TemplateResult {
  if (!ms.length) return html`<p class="note">이 기간에는 원점수가 입력된 모의고사가 없습니다.</p>`;
  const rows = ms[0].rows;
  return html`<table class="t rp-t rk"><thead><tr><th rowspan="2">과목</th>${ms.map((m) => html`<th colspan="3" class="c">${m.round}회 · ${m.date}</th>`)}</tr>
    <tr>${ms.map(() => html`<th class="num">원점수</th><th class="num">평균</th><th class="num">백분위</th>`)}</tr></thead>
    <tbody>${rows.map((row, i) => html`<tr class=${row.sum ? "sumr" : ""}><td>${row.sum ? html`<b>${row.label}</b>` : row.label}</td>${ms.map((m) => mockCell(m.rows[i].c, row.sum))}</tr>`)}
      <tr class="sumr cv"><td><b>환산 총점</b></td>${ms.map((m) => mockCell(m.conv, true, true))}</tr></tbody></table>
    <p class="note">환산 총점 = 수학 100환산 × 비율 + 과학 100환산 × 비율 (200점 만점, 기본 수학 60 : 과학 40) · 평균·백분위는 수강생 전체 기준</p>`;
}
function admTable(r: Rep): TemplateResult {
  return html`<table class="t rp-t"><thead><tr><th>커트라인 그룹 (영재학교)</th><th class="num">안전선 평균</th><th class="num">학생 평균</th><th class="num">차이</th><th>판단</th><th>지망</th></tr></thead>
    <tbody>${r.adm.map((a) => html`<tr><td><b>${a.gname}</b></td><td class="num">${f1(a.cut)}</td><td class="num">${f1(a.stu)}</td>
      <td class="num" style=${a.m == null ? "" : a.m >= 0 ? "color:var(--ok);font-weight:800" : "color:var(--warn);font-weight:800"}>${a.m == null ? "-" : sg(a.m)}</td>
      <td>${a.pv ? html`<span class="chip ${pvClass(a.pv)}">${a.pv}</span>` : html`<span class="note">-</span>`}</td>
      <td style="white-space:nowrap">${r.hopeG[0] === a.gi ? html`<span class="chip info">1지망</span>` : nothing} ${r.hopeG[1] === a.gi ? html`<span class="chip">2지망</span>` : nothing}</td></tr>`)}</tbody></table>`;
}
