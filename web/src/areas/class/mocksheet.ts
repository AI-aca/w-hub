// 수업 › 평가 › 모의고사 성적표: 모의 회차(차수 안의 1·2·3회…)별 과목 원점수·평균·백분위·환산·석차. 참고사이트 '모의고사 성적표'.
// 평균·백분위·석차는 과정 전체 수강생 기준(원본 '3학년 전체'). 만점은 평가 설정에서 정한다(관리 권한).
// 주소: #/weiz/class/<학기>/mock/<회차>/<반 id>
import { html, nothing, type TemplateResult } from "lit-html";
import { api } from "../../shared/core/api";
import { go } from "../../shared/core/route";
import { errMsg } from "../../shared/ui/ui";
import type { App } from "../../shell/app";
import { head } from "../../shell/layout";
import { f1 } from "./evaltext";
import { classes, S } from "./state";
import { weeklyDirty } from "./weekly";

interface Row {
  student_id: string; name: string; class_id: number | null; class_name: string | null; v: Record<string, number | null>;
  ms: number | null; ss: number | null; tot: number | null; cm: number | null; cs: number | null; conv: number | null;
  pms: number | null; pss: number | null; pconv: number | null; rank: number | null;
}
interface Resp {
  rounds: { round: number; date: string; label: string; has: boolean }[]; round: number; subjects: { id: number; name: string; category: string }[];
  max: Record<string, number | null>; mx: number | null; sx: number | null; cnt: number; rows: Row[];
  avg: { sub: Record<string, number | null>; ms: number | null; ss: number | null; tot: number | null; cm: number | null; cs: number | null; conv: number | null };
}
const M = { key: "", dirty: -1, data: null as Resp | null, err: "" };

async function load(app: App, key: string, round: number, cls: number | null): Promise<void> {
  M.key = key; M.dirty = weeklyDirty.n; M.data = null; M.err = "";
  try { const d = await api<Resp>("mockSheet", { term_id: S.termId, round: round || null, class_id: cls }); if (M.key === key) M.data = d; }
  catch (e) { if (M.key === key) M.err = errMsg(e); }
  app.redraw();
}

export function mockSheetMain(app: App, rPart?: string, cPart?: string): TemplateResult {
  const round = Number(rPart) || 0, cls = Number(cPart) || null;
  const key = `${S.termId}:${round}:${cls ?? 0}`;
  if (M.key !== key || M.dirty !== weeklyDirty.n) void load(app, key, round, cls);
  const d = M.key === key ? M.data : null;
  const to = (r: number, c: number | null) => go(app.ws, "class", String(S.termId), "mock", String(r || 0), String(c ?? 0));
  return html`${head({ crumb: "수업 › 평가", title: "모의고사 성적표",
    chips: d?.rounds.length ? html`<div class="seg" role="tablist" aria-label="회차">${d.rounds.map((x) => html`<button role="tab" class=${x.round === d.round ? "on" : ""}
      title=${x.has ? "" : "원점수 없음"} @click=${() => to(x.round, cls)}>${x.round}회${x.has ? "" : "·"}</button>`)}</div>` : undefined,
    actions: html`<div class="seg" role="tablist" aria-label="반"><button role="tab" class=${!cls ? "on" : ""} @click=${() => to(round, null)}>전체</button>
      ${classes().map((c) => html`<button role="tab" class=${c.id === cls ? "on" : ""} @click=${() => to(round, c.id)}>${c.name}</button>`)}</div>` })}
  <div class="content">${M.err ? html`<div class="card"><div class="empty">${M.err}</div></div>` : !d ? html`<div class="loading">계산 중…</div>` : body(d)}</div>`;
}

function body(d: Resp): TemplateResult {
  if (!d.round) return html`<div class="card"><div class="empty">이 학기에는 모의고사 회차가 없습니다. 시간표 상세에서 ‘모의고사 회차’로 표시하면 여기에 나옵니다.</div></div>`;
  const math = d.subjects.filter((s) => s.category === "수학"), sci = d.subjects.filter((s) => s.category === "과학");
  const mk = (id: number) => d.max[String(id)];
  const noMax = d.mx == null || d.sx == null;
  const sub = (x: { name: string; id: number }) => html`<th class="num">${x.name}</th>`;
  const date = d.rounds.find((x) => x.round === d.round)?.label ?? "";
  return html`
  ${noMax ? html`<div class="note" style="margin-bottom:8px"><span class="chip warn">만점 미정</span> 이 회차의 만점이 없는 과목이 있어 환산 점수를 못 냅니다. 평가 설정에서 회차·과목 만점을 정하세요.</div>` : nothing}
  <div class="card" style="overflow:auto"><div class="ch"><b>${d.round}회 · ${date}</b><span class="note">입력된 수강생 ${d.cnt}명 기준 평균·백분위·석차(환산 200점)</span></div>
  <table class="t mk"><thead><tr><th>학생</th>${math.map(sub)}<th class="num">수학</th><th class="num">백분위</th>${sci.map(sub)}<th class="num">과학</th><th class="num">백분위</th>
    <th class="num">총점</th><th class="num">환산 수학</th><th class="num">환산 과학</th><th class="num">환산 총점</th><th class="num">백분위</th><th class="num">석차</th></tr></thead>
  <tbody>
    <tr class="sub-h"><td>만점</td>${math.map((s) => html`<td class="num">${mk(s.id) ?? "-"}</td>`)}<td class="num">${d.mx ?? "-"}</td><td></td>${sci.map((s) => html`<td class="num">${mk(s.id) ?? "-"}</td>`)}<td class="num">${d.sx ?? "-"}</td><td></td>
      <td class="num">${d.mx != null && d.sx != null ? d.mx + d.sx : "-"}</td><td class="num">120</td><td class="num">80</td><td class="num">200</td><td></td><td></td></tr>
    <tr class="sub-h"><td>평균 (${d.cnt}명)</td>${math.map((s) => html`<td class="num">${f1(d.avg.sub[String(s.id)])}</td>`)}<td class="num">${f1(d.avg.ms)}</td><td></td>${sci.map((s) => html`<td class="num">${f1(d.avg.sub[String(s.id)])}</td>`)}<td class="num">${f1(d.avg.ss)}</td><td></td>
      <td class="num">${f1(d.avg.tot)}</td><td class="num">${f1(d.avg.cm)}</td><td class="num">${f1(d.avg.cs)}</td><td class="num">${f1(d.avg.conv)}</td><td></td><td></td></tr>
    ${d.rows.length ? d.rows.map((r) => html`<tr><td style="white-space:nowrap"><b>${r.name}</b> <span class="note">${r.class_name ?? ""}</span></td>
      ${math.map((s) => html`<td class="num">${r.v[String(s.id)] ?? "-"}</td>`)}<td class="num"><b>${r.ms ?? "-"}</b></td><td class="num pc">${r.pms ?? "-"}</td>
      ${sci.map((s) => html`<td class="num">${r.v[String(s.id)] ?? "-"}</td>`)}<td class="num"><b>${r.ss ?? "-"}</b></td><td class="num pc">${r.pss ?? "-"}</td>
      <td class="num">${r.tot ?? "-"}</td><td class="num">${f1(r.cm)}</td><td class="num">${f1(r.cs)}</td><td class="num"><b style="color:var(--accent)">${f1(r.conv)}</b></td><td class="num pc">${r.pconv ?? "-"}</td><td class="num">${r.rank ?? "-"}</td></tr>`)
      : html`<tr><td colspan="19" class="empty">${d.round}회 모의고사 원점수가 아직 없습니다. 성적 입력에서 그 회차를 골라 모의고사 칸에 원점수를 넣어 주세요.</td></tr>`}
  </tbody></table></div>
  <p class="note" style="margin-top:8px">백분위는 그 점수보다 낮은 학생 비율(동점은 절반)로 계산합니다. 환산 = 수학 100환산 × 비율 + 과학 100환산 × 비율(기본 60 : 40 → 120 + 80 = 200점). 커트라인(합격 안전선)은 환산 총점 200점 기준으로 비교합니다.</p>`;
}
