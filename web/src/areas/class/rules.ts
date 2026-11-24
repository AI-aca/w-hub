// 수업 › 평가 › 평가 설정: 가중치·과제 환산·노트 감점·경보 기준·모의 기본 만점(과정별), 모의 회차×과목 만점(학기별)
import { html, type TemplateResult } from "lit-html";
import { api } from "../../shared/core/api";
import { errMsg, toast, ymdhm } from "../../shared/ui/ui";
import type { App } from "../../shell/app";
import { can } from "../../shell/app";
import { head } from "../../shell/layout";
import { dlabel, S, subjects } from "./state";

interface Rules { weights: Record<string, number>; hw_scale: Record<string, number>; note_penalty: number; alert: Record<string, number>; mock_default: Record<string, number | string>; updated_at: string | null; updated_by: string }
interface MaxRow { session_id: number; on_date: string; start_t: string; week_label: string; subject_id: number; subject: string; category: string; max_score: number | null; default_max: number | null }
const R = { course: 0, term: 0, rules: null as Rules | null, form: null as Rules | null, maxes: null as MaxRow[] | null };
const WL: [string, string][] = [["att", "출결"], ["book", "교재"], ["beh", "태도"], ["act", "발표"], ["hw", "과제"], ["test", "위클리테스트"], ["mock", "모의고사"]];
const AL: [string, string, string][] = [["drop", "모의 반 평균 대비 위치 하락", "점 이상"], ["gap", "모의 반 평균보다 낮음", "점 이상"], ["rep", "연속 횟수", "회"], ["days", "대응 기한(수업일부터)", "일"]];

async function loadMaxes(app: App): Promise<void> {
  R.term = S.termId; R.maxes = null;
  try { R.maxes = (await api<{ rows: MaxRow[] }>("mockMaxList", { term_id: S.termId })).rows; } catch (e) { toast(errMsg(e), "bad"); R.maxes = []; }
  app.redraw();
}
async function saveMax(app: App, r: MaxRow, v: string): Promise<void> {
  try { R.maxes = (await api<{ rows: MaxRow[] }>("mockMaxSave", { term_id: S.termId, session_id: r.session_id, subject_id: r.subject_id, max_score: v })).rows; toast("만점을 저장했습니다.", "ok"); }
  catch (e) { toast(errMsg(e), "bad"); await loadMaxes(app); }
  app.redraw();
}

async function loadRules(app: App): Promise<void> {
  R.course = S.courseId; R.rules = null;
  try { R.rules = (await api<{ rules: Rules }>("rulesGet", { course_id: S.courseId })).rules; R.form = structuredClone(R.rules); } catch (e) { toast(errMsg(e), "bad"); }
  app.redraw();
}

export function rulesMain(app: App): TemplateResult {
  if (R.course !== S.courseId) void loadRules(app);
  if (R.term !== S.termId) void loadMaxes(app);
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
    <div class="card"><div class="ch"><b>모의고사 과목별 기본 만점</b><span class="note">회차 만점을 안 정하면 이 값</span></div><div class="cb rl">
      ${subjects().filter((s) => s.active).map((s) => html`<label>${s.name}<input class="sel" style="width:80px" type="number" min="1" max="1000" step="0.5"
        .value=${String(f.mock_default[String(s.id)] ?? "")} ?disabled=${!ad} placeholder="없음" aria-label=${`${s.name} 기본 만점`}
        @input=${(e: Event) => { f.mock_default[String(s.id)] = (e.target as HTMLInputElement).value; }}></label>`)}</div></div>
  </div>
  ${mockMaxCard(app, ad)}
  <div class="note" style="margin-top:10px;line-height:1.7">평가 점수(100점) = 넣은 항목만 가중 평균 − 노트 미흡 횟수 × 감점.
    출결 100 − 결석×5 − 지각×2 · 교재 100 − 미지참×5 · 태도 100 − 지적×3 · 발표 횟수×5(100까지) · 과제 등급 점수 평균 · 위클리 평균 · 모의 (원점수÷만점×100) 평균.<br>
    경보: 모의 위치 하락·반 평균보다 낮음(100점 환산) · 테스트 연속 하락 · 과제 C·D 연속 · 노트 미흡 연속 · 최근 3회 중 결석·지각이 ‘연속 횟수’ 이상.<br>
    이 설정은 다음 단계의 평가 대시보드·집중관리·경보 화면이 씁니다.${R.rules?.updated_at ? ` 마지막 저장 ${ymdhm(R.rules.updated_at)} · ${R.rules.updated_by}` : " 아직 저장한 적 없음(기본값)."}
    ${ad ? "" : " (보기 전용 — 평가 관리 권한이 없습니다.)"}</div></div>`;
}

/** 모의 회차 × 과목 만점. 칸을 바꾸면 바로 저장(관리 권한). 참고사이트 '모의고사 성적표'의 과목별 만점과 같은 자리. */
function mockMaxCard(app: App, ad: boolean): TemplateResult {
  const rows = R.maxes;
  return html`<div class="card" style="margin-top:12px"><div class="ch"><b>모의고사 회차별 만점</b>
    <span class="note">${S.meta?.terms.find((t) => t.id === S.termId)?.name ?? ""} · 시간표 상세에서 ‘모의고사 회차’로 표시한 수업만 나옵니다</span></div>
    <div class="cb">${!rows ? html`<div class="loading">불러오는 중…</div>` : rows.length ? html`<table class="g" style="width:auto">
      <thead><tr><th>주차</th><th>날짜</th><th>과목</th><th>만점</th></tr></thead>
      <tbody>${rows.map((r) => html`<tr><td>${r.week_label}</td><td>${dlabel(r.on_date)} ${r.start_t}</td><td>${r.subject}</td>
        <td class="inp" style="width:90px"><input type="number" min="1" max="1000" step="0.5" .value=${r.max_score == null ? "" : String(r.max_score)} ?disabled=${!ad}
          placeholder=${r.default_max == null ? "미정" : `기본 ${r.default_max}`} aria-label=${`${r.on_date} ${r.subject} 만점`}
          @change=${(e: Event) => void saveMax(app, r, (e.target as HTMLInputElement).value.trim())}></td></tr>`)}</tbody></table>`
      : html`<div class="empty">이 학기에는 모의고사 회차가 없습니다.</div>`}
    <div class="note" style="margin-top:8px">빈 칸이면 위의 과목별 기본 만점을 씁니다. 둘 다 없으면 그 회차 모의 점수는 평가에서 빠집니다. 선생님 입력표에는 만점이 보이기만 합니다.
      4단계(모의고사)를 옮긴 뒤에는 모의고사 시험 설정의 만점을 가져옵니다.</div></div></div>`;
}
