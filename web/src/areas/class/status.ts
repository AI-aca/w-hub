// 수업 › 평가 › 입력 현황(회차 × 반, 입력한 학생 수/수강생 수) · 평가 설정(가중치·과제 환산·노트 감점·경보 기준)
import { html, nothing, type TemplateResult } from "lit-html";
import { api } from "../../shared/core/api";
import { go } from "../../shared/core/route";
import { errMsg, toast, ymdhm } from "../../shared/ui/ui";
import type { App } from "../../shell/app";
import { can } from "../../shell/app";
import { head } from "../../shell/layout";
import { classes, dlabel, S, today } from "./state";
import { weeklyDirty } from "./weekly";

const T = { term: 0, dirty: -1, rows: null as { session_id: number; class_id: number; total: number; filled: number }[] | null };

async function loadStatus(app: App): Promise<void> {
  T.term = S.termId; T.dirty = weeklyDirty.n; T.rows = null;
  try { T.rows = (await api<{ rows: NonNullable<typeof T.rows> }>("weeklyStatus", { term_id: S.termId })).rows; } catch (e) { toast(errMsg(e), "bad"); T.rows = []; }
  app.redraw();
}

export function statusMain(app: App): TemplateResult {
  if (T.term !== S.termId || T.dirty !== weeklyDirty.n) void loadStatus(app);
  const cls = classes();
  const now = today();
  const ss = S.term!.sessions.filter((s) => s.kind === "class" && s.cells.length);
  const at = new Map((T.rows ?? []).map((r) => [`${r.session_id}:${r.class_id}`, r]));
  let full = 0, part = 0, none = 0;
  for (const s of ss) if (s.on_date <= now) for (const c of s.cells) {
    const r = at.get(`${s.id}:${c.class_id}`);
    if (!r || !r.total) continue;
    if (r.filled >= r.total) full++; else if (r.filled) part++; else none++;
  }
  return html`${head({ crumb: "수업 › 평가", title: "입력 현황",
    chips: T.rows ? html`<span class="chip ok">완료 ${full}</span><span class="chip warn">일부 ${part}</span><span class="chip bad">미입력 ${none}</span>` : undefined,
    actions: html`<button class="btn" @click=${() => void loadStatus(app)}>새로 고침</button>` })}
  <div class="content">${!T.rows ? html`<div class="loading">불러오는 중…</div>` : ss.length ? html`<div class="gridwrap"><table class="g tt st">
    <thead><tr><th class="fx" style="left:0;min-width:70px">주차</th><th style="min-width:110px">날짜</th>${cls.map((c) => html`<th style="min-width:90px">${c.name}</th>`)}</tr></thead>
    <tbody>${ss.map((s) => html`<tr class=${s.on_date > now ? "past" : ""}>
      <td class="fx" style="left:0"><b>${s.week_label}</b></td><td>${dlabel(s.on_date)}${s.mock ? html` <span class="chip warn">모의</span>` : nothing}</td>
      ${cls.map((c) => {
        if (!s.cells.some((x) => x.class_id === c.id)) return html`<td class="c note">—</td>`;
        const r = at.get(`${s.id}:${c.id}`);
        const tot = r?.total ?? 0, n = r?.filled ?? 0;
        const k = !tot ? "" : n >= tot ? "ok" : n ? "part" : s.on_date <= now ? "none" : "";
        return html`<td class="c click"><button class="stc ${k}" @click=${() => go(app.ws, "class", String(S.termId), "input", String(s.id), String(c.id))}
          title="눌러서 입력">${tot ? `${n}/${tot}` : "수강생 없음"}</button></td>`;
      })}</tr>`)}</tbody></table></div>
    <div class="note" style="margin-top:8px">숫자 = 입력한 학생 / 반 수강생. 지난 회차의 빈칸은 빨강, 일부만 넣은 칸은 주황입니다. 칸을 누르면 그 입력표로 갑니다.</div>`
    : html`<div class="card"><div class="empty">수업 회차가 없습니다.</div></div>`}</div>`;
}

interface Rules { weights: Record<string, number>; hw_scale: Record<string, number>; note_penalty: number; alert: Record<string, number>; updated_at: string | null; updated_by: string }
const R = { course: 0, rules: null as Rules | null, form: null as Rules | null };
const WL: [string, string][] = [["att", "출결"], ["book", "교재"], ["beh", "태도"], ["act", "발표"], ["hw", "과제"], ["test", "위클리테스트"], ["mock", "모의고사"]];
const AL: [string, string, string][] = [["drop", "모의 반 평균 대비 위치 하락", "점 이상"], ["gap", "모의 반 평균보다 낮음", "점 이상"], ["rep", "연속 횟수", "회"], ["days", "대응 기한(수업일부터)", "일"]];

async function loadRules(app: App): Promise<void> {
  R.course = S.courseId; R.rules = null;
  try { R.rules = (await api<{ rules: Rules }>("rulesGet", { course_id: S.courseId })).rules; R.form = structuredClone(R.rules); } catch (e) { toast(errMsg(e), "bad"); }
  app.redraw();
}

export function rulesMain(app: App): TemplateResult {
  if (R.course !== S.courseId) void loadRules(app);
  const f = R.form;
  const ad = can(app, "scores_weekly", "admin");
  if (!f) return html`${head({ crumb: "수업 › 평가", title: "평가 설정" })}<div class="loading">불러오는 중…</div>`;
  const n = (o: Record<string, number>, k: string, max: number, step = "1") => html`<input class="sel" style="width:80px" type="number" min="0" max=${String(max)} step=${step}
    .value=${String(o[k] ?? 0)} ?disabled=${!ad} @input=${(e: Event) => { o[k] = Number((e.target as HTMLInputElement).value); app.redraw(); }}>`;
  const sum = Object.values(f.weights).reduce((a, b) => a + (Number(b) || 0), 0);
  const save = async () => {
    try { R.rules = (await api<{ rules: Rules }>("rulesSave", { course_id: S.courseId, ...f })).rules; R.form = structuredClone(R.rules); toast("저장했습니다.", "ok"); } catch (e) { toast(errMsg(e), "bad"); }
    app.redraw();
  };
  return html`${head({ crumb: "수업 › 평가", title: "평가 설정", chips: html`<span class="chip">${S.meta?.courses.find((c) => c.id === S.courseId)?.name ?? ""}</span>`,
    actions: ad ? html`<button class="btn" @click=${() => { R.form = structuredClone(R.rules); app.redraw(); }}>되돌리기</button><button class="btn pri" @click=${save}>저장</button>` : undefined })}
  <div class="content"><div class="rules">
    <div class="card"><div class="ch"><b>항목 가중치</b><span class="note">합 ${sum} (비율로 씀)</span></div><div class="cb rl">
      ${WL.map(([k, l]) => html`<label>${l}${n(f.weights, k, 100)}</label>`)}</div></div>
    <div class="card"><div class="ch"><b>과제 등급 → 점수</b></div><div class="cb rl">${["A", "B", "C", "D"].map((k) => html`<label>${k}${n(f.hw_scale, k, 100)}</label>`)}</div></div>
    <div class="card"><div class="ch"><b>노트 미흡 감점</b></div><div class="cb rl"><label>1회당${n(f as unknown as Record<string, number>, "note_penalty", 20, "0.5")}점</label></div></div>
    <div class="card"><div class="ch"><b>경보 기준</b></div><div class="cb rl">${AL.map(([k, l, u]) => html`<label>${l}${n(f.alert, k, 100)}${u}</label>`)}</div></div>
  </div>
  <div class="note" style="margin-top:10px;line-height:1.7">평가 점수(100점) = 넣은 항목만 가중 평균 − 노트 미흡 횟수 × 감점.
    출결 100 − 결석×5 − 지각×2 · 교재 100 − 미지참×5 · 태도 100 − 지적×3 · 발표 횟수×5(100까지) · 과제 등급 점수 평균 · 위클리 평균 · 모의 (원점수÷만점×100) 평균.<br>
    경보: 모의 위치 하락·반 평균보다 낮음(100점 환산) · 테스트 연속 하락 · 과제 C·D 연속 · 노트 미흡 연속 · 최근 3회 중 결석·지각이 ‘연속 횟수’ 이상.<br>
    이 설정은 다음 단계의 평가 대시보드·집중관리·경보 화면이 씁니다.${R.rules?.updated_at ? ` 마지막 저장 ${ymdhm(R.rules.updated_at)} · ${R.rules.updated_by}` : " 아직 저장한 적 없음(기본값)."}
    ${ad ? "" : " (보기 전용 — 평가 관리 권한이 없습니다.)"}</div></div>`;
}
