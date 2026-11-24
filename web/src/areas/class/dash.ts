// 수업 › 평가 › 평가 대시보드: 반 고르기 → 요약 칸 · 집중관리 하위 5명 · 반 명단(정렬) · 학생 상세(강점·보완, 그래프, 항목별 표).
// 주소: #/weiz/class/<학기>/dash/<반 id>/<학생 id>
import { html, nothing, type TemplateResult } from "lit-html";
import { api } from "../../shared/core/api";
import { go } from "../../shared/core/route";
import { errMsg } from "../../shared/ui/ui";
import type { App } from "../../shell/app";
import { head } from "../../shell/layout";
import { classes, S, today } from "./state";
import { type EvResp, type EvRow, f1, sg, strengths } from "./evaltext";
import { subjectBars, trendChart } from "./charts";
import { weeklyDirty } from "./weekly";

const D = { key: "", dirty: -1, data: null as EvResp | null, err: "", sort: "rank", desc: false };

async function load(app: App, key: string, classId: number): Promise<void> {
  D.key = key; D.dirty = weeklyDirty.n; D.data = null; D.err = "";
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
  <div class="content">${D.err ? html`<div class="card"><div class="empty">${D.err}</div></div>` : !d ? html`<div class="loading">계산 중…</div>` : body(d, k.name, sPart, (s) => to(k.id, s), subj, () => app.redraw())}</div>`;
}

function body(d: EvResp, cname: string, pick: string | undefined, choose: (s: string) => void, subj: (id: number | null) => string, redraw: () => void): TemplateResult {
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
  ];
  const sc = cols.find((c) => c.k === D.sort) ?? cols[0];
  const rows = [...list].sort((a, b) => {
    const x = sc.v(a), y = sc.v(b);
    const c = typeof x === "number" && typeof y === "number" ? x - y : x == null ? 1 : y == null ? -1 : String(x).localeCompare(String(y), "ko");
    return D.desc ? -c : c;
  });
  const sortBy = (k: string) => { D.desc = D.sort === k ? !D.desc : !["rank", "name", "ntM", "ntS"].includes(k); D.sort = k; redraw(); };
  const sel = list.find((r) => r.student_id === pick) ?? list[0];
  return html`
  ${d.missingMax ? html`<div class="note" style="margin-bottom:8px"><span class="chip warn">만점 미정 ${d.missingMax}건</span> 만점이 없는 모의 원점수는 평가에서 빠져 있습니다. 평가 설정에서 회차·과목 만점을 정하세요.</div>` : nothing}
  <div class="kpis">
    <div class="kpi"><div class="k">${cname} 인원</div><div class="v">${d.rows.length}<small>명</small></div><div class="s">성적 기록 ${list.length}명</div></div>
    <div class="kpi"><div class="k">최종 종합 평균</div><div class="v">${f1(st.final)}</div><div class="s">수학 ${cw["수학"] ?? 60} · 과학 ${cw["과학"] ?? 40}</div></div>
    <div class="kpi"><div class="k">모의고사 환산 총점 평균</div><div class="v">${f1(st.mockRecent)}<small>/200</small></div><div class="s">최근 3회 · 수학·과학 같은 비율</div></div>
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
      if (c.k === "ntM" || c.k === "ntS") return html`<td class="num">${v ? html`<b style="color:var(--warn)">${v}</b>` : html`<span class="note">0</span>`}</td>`;
      return html`<td class="num">${c.k === "final" ? html`<b>${f1(v as number | null)}</b>` : f1(v as number | null)}</td>`;
    })}</tr>`)}</tbody></table></div>
  ${detail(d, sel, cname, subj)}`;
}

function detail(d: EvResp, r: EvRow, cname: string, subj: (id: number | null) => string): TemplateResult {
  const st = d.st, sw = strengths(r, st, d.subjects);
  const subs = d.subjects.filter((s) => r.comp[s.id]);
  const W = d.weights ?? {};
  const items: [keyof EvRow["comp"][string], string, string][] = [["attendance", "출결", "att"], ["textbook", "교재", "book"], ["attitude", "수업태도", "beh"], ["activity", "적극성", "act"], ["homework", "과제", "hw"], ["test", "테스트", "test"], ["mock", "모의고사", "mock"]];
  const wsum = items.reduce((a, [, , k]) => a + Number(W[k] ?? 0), 0) || 1;
  const now = today();
  const weeks = d.weeks.filter((w) => w.from <= now); // 지난 주차까지
  const mini = (l: string, v: number | null, a: number | null) => html`<div><span>${l}</span><b>${f1(v)}</b><em>${v != null && a != null ? sg(v - a) : ""}</em></div>`;
  return html`<div class="card"><div class="ch"><b>학생 상세 · ${r.name}</b><span class="note">${cname} · ${r.rank}위 / ${d.rows.filter((x) => x.final != null).length}명</span></div><div class="cb">
    <div class="mini4">${mini("최종 종합", r.final, st.final)}${mini("수학", r.math, st.math)}${mini("과학", r.sci, st.sci)}${mini("모의 환산 (최근 3회 · 200)", r.mockRecent, st.mockRecent)}</div>
    <p class="note" style="margin:4px 0 12px">작은 숫자는 반 평균과의 차이</p>
    <div class="two">
      <div><h4>강점</h4><ul class="sw">${sw.good.length ? sw.good.map((x) => html`<li>${x.t}</li>`) : html`<li class="note">반 평균보다 3점 이상 높은 항목이 아직 없습니다</li>`}</ul></div>
      <div><h4>보완할 점</h4><ul class="sw bad">${sw.bad.length ? sw.bad.map((x) => html`<li>${x.t}</li>`) : html`<li class="note">반 평균보다 3점 이상 낮은 항목이 없습니다</li>`}</ul></div>
    </div>
    <div class="two">
      <div><h4>모의고사 종합 추이 (200점)</h4>${trendChart(r, st)}</div>
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
    <p class="note" style="margin-top:10px">과목 종합 = 넣은 항목만 가중 평균 − 노트 미흡 감점 · 최종 = 수학 ${d.cat_weights?.["수학"] ?? 60} : 과학 ${d.cat_weights?.["과학"] ?? 40} · 커트라인·1지망 판단은 다음 단계(3-2 C)에서 붙습니다. ${subj(r.weak) ? `취약 과목: ${subj(r.weak)}` : ""}</p>
  </div></div>`;
}
