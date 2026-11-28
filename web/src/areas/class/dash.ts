// 수업 › 평가 › 평가 대시보드: 반 고르기 → 요약 칸 · 집중관리 하위 5명 · 반 명단(정렬) · 학생 상세(강점·보완, 그래프, 항목별 표).
// 주소: #/weiz/class/<학기>/dash/<반 id>/<학생 id>
import { html, nothing, type TemplateResult } from "lit-html";
import { api } from "../../shared/core/api";
import { go } from "../../shared/core/route";
import { errMsg, toast } from "../../shared/ui/ui";
import type { App } from "../../shell/app";
import { can } from "../../shell/app";
import { head } from "../../shell/layout";
import { classes, S, today } from "./state";
import { type EvResp, type EvRow, f1, pvClass, schoolLabel, sg, strengths } from "./evaltext";
import { subjectBars, trendChart } from "./charts";
import { weeklyDirty } from "./weekly";
import { track } from "./busy";

const D = { key: "", dirty: -1, data: null as EvResp | null, err: "", sort: "rank", desc: false };

async function load(app: App, key: string, classId: number): Promise<void> {
  // 같은 반을 다시 계산할 때는 지금 화면을 그대로 둔다(칸에 쓰던 글자가 사라지지 않게). 다른 반이면 비운다.
  const same = D.key === key;
  D.key = key; D.dirty = weeklyDirty.n; if (!same) D.data = null; D.err = "";
  try { const d = await api<EvResp>("evalClass", { term_id: S.termId, class_id: classId }); if (D.key === key) D.data = d; }
  catch (e) { if (D.key === key) D.err = errMsg(e); }
  app.redraw();
}

export function dashMain(app: App, cPart?: string, sPart?: string): TemplateResult {
  const cls = classes();
  const k = cls.find((c) => c.id === Number(cPart)) ?? cls[0];
  if (!k) return html`${head({ crumb: "수업 › 평가", title: "평가 대시보드" })}<div class="content"><div class="empty">반이 없습니다.</div></div>`;
  const key = `${S.termId}:${k.id}`;
  if (D.key !== key || D.dirty !== weeklyDirty.n) void load(app, key, k.id);
  const to = (c: number, s = "") => go(app.ws, "class", String(S.termId), "dash", String(c), ...(s ? [s] : []));
  const d = D.key === key ? D.data : null;
  const subj = (id: number | null) => d?.subjects.find((s) => s.id === id)?.name ?? "";
  return html`${head({ crumb: "수업 › 평가", title: "평가 대시보드",
    chips: html`<div class="seg" role="tablist" aria-label="반">${cls.map((c) => html`<button role="tab" class=${c.id === k.id ? "on" : ""} @click=${() => to(c.id)}>${c.name}</button>`)}</div>` })}
  <div class="content">${D.err ? html`<div class="card"><div class="empty">${D.err}</div></div>` : !d ? html`<div class="loading">계산 중…</div>` : body(app, d, k.name, sPart, (s) => to(k.id, s), subj, () => app.redraw())}</div>`;
}

/** 커트라인 한 칸 저장(관리 권한). 저장하면 평가 대시보드를 다시 계산한다. */
async function saveCut(app: App, el: HTMLInputElement, prev: string, round: number, grp: number, v: string): Promise<void> {
  try { await track(api("cutSave", { term_id: S.termId, round, grp, value: v })); toast("커트라인을 저장했습니다.", "ok"); }
  catch (e) { toast(errMsg(e), "bad"); el.value = prev; } // 거절된 값은 칸에 남기지 않고 저장돼 있던 값으로
  weeklyDirty.n++;
  app.redraw();
}
async function saveHope(app: App, el: HTMLSelectElement, prev: string, sid: string, field: "hope1" | "hope2", v: string): Promise<void> {
  try { await track(api("hopeSave", { term_id: S.termId, student_id: sid, field, value: v })); }
  catch (e) { toast(errMsg(e), "bad"); el.value = prev; }
  weeklyDirty.n++; // 판단을 다시 계산해 표·KPI 에 반영(실패해도 서버 값으로 되돌림)
  app.redraw();
}

const md = (s: string) => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`;
/** 회차별 모의고사 커트라인(합격 안전선, 200점 만점) 표 + 이 반 평균 줄 */
function cutCard(app: App, d: EvResp): TemplateResult {
  const ad = can(app, "scores_weekly", "admin");
  const rounds = d.weeks.filter((w) => w.mock && w.round != null);
  return html`<div class="card" style="margin-bottom:12px;overflow:auto"><div class="ch"><b>회차별 모의고사 커트라인</b>
    <span class="note">200점 만점 · 합격 안전선 = 합격률 80% 이상 · ${ad ? "칸에 입력하면 바로 저장" : "보기 전용(관리 권한이 입력)"}</span></div>
    ${rounds.length ? html`<table class="t cutt"><thead><tr><th>커트라인 그룹</th>${rounds.map((w) => html`<th class="c">${w.round}회<br><span class="note">${md(w.from)}</span></th>`)}</tr></thead>
    <tbody>${d.groups.map((g, gi) => html`<tr><td style="white-space:nowrap"><b>${g}</b></td>${rounds.map((w) => html`<td class="c"><input class="sel cin" type="number" step="0.5" min="0" max="200"
      aria-label=${`${w.round}회 ${g} 커트라인`} .value=${d.cut[w.round!]?.[gi] == null ? "" : String(d.cut[w.round!][gi])} ?disabled=${!ad}
      @change=${(e: Event) => { const el = e.target as HTMLInputElement; void saveCut(app, el, d.cut[w.round!]?.[gi] == null ? "" : String(d.cut[w.round!][gi]), w.round!, gi, el.value.trim()); }}></td>`)}</tr>`)}
    <tr class="avgrow"><td><b>이 반 평균</b></td>${rounds.map((w) => html`<td class="c">${d.st.round[w.round!] ? f1(d.st.round[w.round!].comp) : "-"}</td>`)}</tr></tbody></table>`
    : html`<div class="cb note">이 학기에는 모의고사 회차가 없습니다. 시간표 상세에서 ‘모의고사 회차’로 표시하면 여기에 나옵니다.</div>`}</div>`;
}

function body(app: App, d: EvResp, cname: string, pick: string | undefined, choose: (s: string) => void, subj: (id: number | null) => string, redraw: () => void): TemplateResult {
  const st = d.st, list = d.rows.filter((r) => r.final != null);
  const cw = d.cat_weights ?? {};
  if (!list.length) return html`<div class="card"><div class="empty">${d.rows.length ? `${cname}에 아직 입력된 성적이 없습니다. 성적 입력에서 기록하면 여기에 바로 반영됩니다.` : `${cname}에 배정된 수강생이 없습니다.`}</div></div>`;
  const focus = [...list].sort((a, b) => a.final! - b.final!).slice(0, 5);
  const fset = new Set(focus.map((r) => r.student_id));
  const math = d.subjects.filter((s) => s.category === "수학"), sci = d.subjects.filter((s) => s.category === "과학");
  const cols: { k: string; l: string; v: (r: EvRow) => number | string | null; num?: boolean }[] = [
    { k: "rank", l: "석차", v: (r) => r.rank, num: true }, { k: "name", l: "이름", v: (r) => r.name },
    ...math.map((s) => ({ k: `s${s.id}`, l: s.name, v: (r: EvRow) => r.sub[s.id] ?? null, num: true })), { k: "math", l: "수학", v: (r) => r.math, num: true },
    ...sci.map((s) => ({ k: `s${s.id}`, l: s.name, v: (r: EvRow) => r.sub[s.id] ?? null, num: true })), { k: "sci", l: "과학", v: (r) => r.sci, num: true },
    { k: "ntM", l: "오답노트 미흡", v: (r) => r.ntM, num: true }, { k: "ntS", l: "이론노트 미흡", v: (r) => r.ntS, num: true },
    { k: "mock", l: "모의 환산", v: (r) => r.mockRecent, num: true }, { k: "final", l: "최종", v: (r) => r.final, num: true },
    { k: "h1", l: "1지망 판단", v: (r) => r.h1?.m ?? -999 },
  ];
  const sc = cols.find((c) => c.k === D.sort) ?? cols[0];
  const rows = [...list].sort((a, b) => {
    const x = sc.v(a), y = sc.v(b);
    const c = typeof x === "number" && typeof y === "number" ? x - y : x == null ? 1 : y == null ? -1 : String(x).localeCompare(String(y), "ko");
    return D.desc ? -c : c;
  });
  const sortBy = (k: string) => { D.desc = D.sort === k ? !D.desc : !["rank", "name", "ntM", "ntS"].includes(k); D.sort = k; redraw(); };
  const sel = list.find((r) => r.student_id === pick) ?? list[0];
  const h1 = (r: EvRow) => r.h1 && r.h1.pv ? html`<span class="chip ${pvClass(r.h1.pv)}">${r.h1.pv}</span> <span class="note">${r.hope1} ${sg(r.h1.m)}</span>` : html`<span class="note">-</span>`;
  const pass = list.filter((r) => r.h1 && r.h1.m != null && r.h1.m >= 0).length;
  const near = list.filter((r) => r.h1 && r.h1.m != null && r.h1.m < 0 && r.h1.m >= -10).length;
  return html`${cutCard(app, d)}
  ${d.missingMax ? html`<div class="note" style="margin-bottom:8px"><span class="chip warn">만점 미정 ${d.missingMax}건</span> 만점이 없는 모의 원점수는 평가에서 빠져 있습니다. 평가 설정에서 회차·과목 만점을 정하세요.</div>` : nothing}
  <div class="kpis k5">
    <div class="kpi"><div class="k">${cname} 인원</div><div class="v">${d.rows.length}<small>명</small></div><div class="s">성적 기록 ${list.length}명</div></div>
    <div class="kpi"><div class="k">최종 종합 평균</div><div class="v">${f1(st.final)}</div><div class="s">수학 ${cw["수학"] ?? 60} · 과학 ${cw["과학"] ?? 40}</div></div>
    <div class="kpi"><div class="k">모의고사 환산 총점 평균</div><div class="v">${f1(st.mockRecent)}<small>/200</small></div><div class="s">최근 3회 · 수학·과학 같은 비율</div></div>
    <div class="kpi"><div class="k">1지망 안전선 통과</div><div class="v">${pass}<small>명</small></div><div class="s">근접 ${near}명 · 안전선 −10점 이내</div></div>
    <div class="kpi"><div class="k">노트 미흡 평균</div><div class="v">${f1(st.note)}<small>회</small></div><div class="s">오답 ${f1(st.ntM)} · 이론 ${f1(st.ntS)}</div></div>
  </div>
  <div class="card" style="margin-bottom:12px"><div class="ch"><b>집중관리 대상</b><span class="note">최종 종합 하위 5명 · 누르면 상세</span></div>
    <div class="cb fcs">${focus.map((r) => html`<button class="fc ${r.student_id === sel.student_id ? "on" : ""}" @click=${() => choose(r.student_id)}>
      <b>${r.name}</b> <span class="note">${r.rank}위</span><div class="sc">${f1(r.final)}</div><div class="note">취약 ${subj(r.weak)}${r.note ? ` · 노트 미흡 ${r.note}회` : ""}</div></button>`)}</div></div>
  <div class="card" style="margin-bottom:12px;overflow:auto"><div class="ch"><b>반 명단</b><span class="note">머리글을 누르면 정렬 · 줄을 누르면 상세</span></div>
    <table class="t ev"><thead><tr>${cols.map((c) => html`<th class=${c.num ? "num" : ""} @click=${() => sortBy(c.k)} style="cursor:pointer">${c.l}${D.sort === c.k ? html` <span class="sort-ar">${D.desc ? "▼" : "▲"}</span>` : nothing}</th>`)}</tr></thead>
    <tbody>${rows.map((r) => html`<tr class="click ${r.student_id === sel.student_id ? "pick" : ""}" @click=${() => choose(r.student_id)}>${cols.map((c) => {
      const v = c.v(r);
      if (c.k === "name") return html`<td><b>${r.name}</b>${fset.has(r.student_id) ? html` <span class="chip warn">집중</span>` : nothing}</td>`;
      if (c.k === "rank") return html`<td class="num">${v}</td>`;
      if (c.k === "h1") return html`<td style="white-space:nowrap">${h1(r)}</td>`;
      if (c.k === "ntM" || c.k === "ntS") return html`<td class="num">${v ? html`<b style="color:var(--warn)">${v}</b>` : html`<span class="note">0</span>`}</td>`;
      return html`<td class="num">${c.k === "final" ? html`<b>${f1(v as number | null)}</b>` : f1(v as number | null)}</td>`;
    })}</tr>`)}</tbody></table></div>
  ${detail(app, d, sel, cname, subj)}`;
}

/** 학교 고르기(그룹별 묶음). 입력 권한이 있을 때만 바꿀 수 있다. */
function schoolSel(app: App, d: EvResp, r: EvRow, f: "hope1" | "hope2", ed: boolean): TemplateResult {
  const cur = r[f];
  return html`<select class="sel" aria-label=${f === "hope1" ? "1지망" : "2지망"} ?disabled=${!ed}
    @change=${(e: Event) => { const el = e.target as HTMLSelectElement, prev = r[f]; r[f] = el.value; void saveHope(app, el, prev, r.student_id, f, el.value); }}>
    <option value="">선택 안 함</option>${d.groups.map((g, gi) => html`<optgroup label=${g}>${d.schools.filter((s) => s[1] === gi).map((s) => html`<option value=${s[0]} ?selected=${cur === s[0]}>${schoolLabel(s[0])}</option>`)}</optgroup>`)}</select>`;
}

function admTable(d: EvResp, r: EvRow): TemplateResult {
  const g1 = d.schools.find((s) => s[0] === r.hope1)?.[1], g2 = d.schools.find((s) => s[0] === r.hope2)?.[1];
  return html`<div style="overflow:auto"><table class="t"><thead><tr><th>커트라인 그룹 (영재학교)</th><th class="num">안전선 평균</th><th class="num">학생 평균</th><th class="num">차이</th><th>판단</th><th>지망</th></tr></thead>
    <tbody>${r.adm.map((a) => html`<tr><td><b>${a.gname}</b> <span class="note">${d.schools.filter((s) => s[1] === a.gi).map((s) => schoolLabel(s[0])).join(" · ")}</span></td>
      <td class="num">${f1(a.cut)}</td><td class="num">${f1(a.stu)}</td><td class="num" style=${a.m == null ? "" : a.m >= 0 ? "color:var(--ok);font-weight:800" : "color:var(--warn);font-weight:800"}>${a.m == null ? "-" : sg(a.m)}</td>
      <td>${a.pv ? html`<span class="chip ${pvClass(a.pv)}">${a.pv}</span>` : html`<span class="note">-</span>`}</td>
      <td style="white-space:nowrap">${g1 === a.gi ? html`<span class="chip info">1지망</span>` : nothing} ${g2 === a.gi ? html`<span class="chip">2지망</span>` : nothing}</td></tr>`)}</tbody></table></div>`;
}

function detail(app: App, d: EvResp, r: EvRow, cname: string, subj: (id: number | null) => string): TemplateResult {
  const st = d.st, sw = strengths(r, st, d.subjects);
  const subs = d.subjects.filter((s) => r.comp[s.id]);
  const W = d.weights ?? {};
  const items: [keyof EvRow["comp"][string], string, string][] = [["attendance", "출결", "att"], ["textbook", "교재", "book"], ["attitude", "수업태도", "beh"], ["activity", "적극성", "act"], ["homework", "과제", "hw"], ["test", "테스트", "test"], ["mock", "모의고사", "mock"]];
  const wsum = items.reduce((a, [, , k]) => a + Number(W[k] ?? 0), 0) || 1;
  const ed = can(app, "scores_weekly", "editor");
  const g1 = d.schools.find((x) => x[0] === r.hope1)?.[1];
  const cutPts = g1 == null ? [] : Object.entries(d.cut).filter(([, v]) => v[g1] != null).map(([k, v]) => ({ round: Number(k), value: v[g1] as number }));
  const now = today();
  const weeks = d.weeks.filter((w) => w.from <= now); // 지난 주차까지
  const mini = (l: string, v: number | null, a: number | null) => html`<div><span>${l}</span><b>${f1(v)}</b><em>${v != null && a != null ? sg(v - a) : ""}</em></div>`;
  return html`<div class="card"><div class="ch"><b>학생 상세 · ${r.name}</b><span class="note">${cname} · ${r.rank}위 / ${d.rows.filter((x) => x.final != null).length}명</span></div><div class="cb">
    <div class="mini4">${mini("최종 종합", r.final, st.final)}${mini("수학", r.math, st.math)}${mini("과학", r.sci, st.sci)}${mini("모의 환산 (최근 3회 · 200)", r.mockRecent, st.mockRecent)}</div>
    <p class="note" style="margin:4px 0 12px">작은 숫자는 반 평균과의 차이</p>
    <div class="hope"><label>1지망 ${schoolSel(app, d, r, "hope1", ed)}</label><label>2지망 ${schoolSel(app, d, r, "hope2", ed)}</label>
      <div class="rec"><span class="note">우리 판단 · 지원 가능 (안전선 기준)</span>
        <b>${r.rec ? html`${r.rec.gname} <span class="chip ${pvClass(r.rec.pv)}">${r.rec.pv}</span>` : "커트라인 입력 후 표시"}</b>
        ${r.h1?.pv ? html`<span class="note">1지망 ${r.hope1} → ${r.h1.pv} (안전선 ${sg(r.h1.m)})</span>` : nothing}
        ${(() => { const g = d.schools.find((s) => s[0] === r.hope2)?.[1], a = g != null ? r.adm[g] : null; return a?.pv ? html`<span class="note">2지망 ${r.hope2} → ${a.pv} (안전선 ${sg(a.m)})</span>` : nothing; })()}</div></div>
    <h4>지원 가능 영재학교</h4>${admTable(d, r)}
    <p class="note" style="margin:4px 0 12px">커트라인은 합격 안전선(합격률 80% 이상)입니다. 안전선에 못 미쳐도 합격할 수 있습니다. 안전: 안전선 이상 · 근접: −10점 이내 · 소신: −20점 이내 · 도전: 그 아래. 학생 모의 종합은 커트라인이 입력된 최근 3회 평균입니다.</p>
    <div class="two">
      <div><h4>강점</h4><ul class="sw">${sw.good.length ? sw.good.map((x) => html`<li>${x.t}</li>`) : html`<li class="note">반 평균보다 3점 이상 높은 항목이 아직 없습니다</li>`}</ul></div>
      <div><h4>보완할 점</h4><ul class="sw bad">${sw.bad.length ? sw.bad.map((x) => html`<li>${x.t}</li>`) : html`<li class="note">반 평균보다 3점 이상 낮은 항목이 없습니다</li>`}</ul></div>
    </div>
    <div class="two">
      <div><h4>모의고사 종합 추이 (200점)</h4>${trendChart(r, st, { cut: cutPts })}</div>
      <div><h4>과목별 종합 점수</h4>${subjectBars(r, st, d.subjects)}</div>
    </div>
    <h4>항목별 점수</h4>
    <div style="overflow:auto"><table class="t"><thead><tr><th>과목</th>${items.map(([, l, k]) => html`<th class="num">${l} ${Math.round(Number(W[k] ?? 0) / wsum * 100)}%</th>`)}<th class="num">노트 미흡</th><th class="num">과목 종합</th><th class="num">반 평균 대비</th></tr></thead>
      <tbody>${subs.map((s) => { const c = r.comp[s.id], a = st.sub[s.id]; return html`<tr><td>${s.name}</td>
        ${items.map(([f]) => { const v = c[f] as number | null; return html`<td class="num" style=${v != null && v < 60 ? "color:var(--bad)" : ""}>${f1(v)}</td>`; })}
        <td class="num">${c.nt ? html`<b style="color:var(--warn)">${c.nt}회 (−${f1(c.ded)})</b>` : "0"}</td><td class="num"><b>${f1(c.total)}</b></td><td class="num">${a != null ? sg(c.total - a) : ""}</td></tr>`; })}</tbody></table></div>
    <h4>노트정리 미흡 (주차별)</h4>
    <div style="overflow:auto"><table class="t"><thead><tr><th>구분</th>${weeks.map((w) => html`<th class="c">${w.label}</th>`)}<th class="c">합계</th></tr></thead>
      <tbody>${([["수학 오답노트", r.ntBy.m, r.ntM], ["과학 이론노트", r.ntBy.s, r.ntS]] as [string, Record<string, number>, number][]).map(([l, o, t]) => html`<tr><td><b>${l}</b></td>
        ${weeks.map((w) => html`<td class="c">${o[w.no] ? html`<b style="color:var(--warn)">${o[w.no]}</b>` : html`<span class="note">·</span>`}</td>`)}<td class="c"><b>${t}</b></td></tr>`)}</tbody></table></div>
    <p class="note" style="margin-top:10px">과목 종합 = 넣은 항목만 가중 평균 − 노트 미흡 감점 · 최종 = 수학 ${d.cat_weights?.["수학"] ?? 60} : 과학 ${d.cat_weights?.["과학"] ?? 40} ${subj(r.weak) ? `취약 과목: ${subj(r.weak)}` : ""}</p>
  </div></div>`;
}
