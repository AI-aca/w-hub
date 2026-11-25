// 수업(주말반): 왼쪽 = 과정·학기·화면 목록, 오른쪽 = 고른 화면.
// 주소: #/weiz/class/<학기 id>/<화면>  화면 = overview · tasks · summary · detail · math · science · roster · input · status · dash · focus · alerts · rules · setup
// 시간표·진도·학생은 '수업' 권한, 평가(성적 입력·입력 현황·평가 설정)는 '성적·주말반' 권한. 둘은 따로 줄 수 있다.
import { html, nothing, type TemplateResult } from "lit-html";
import { go, href } from "../../shared/core/route";
import type { App, View } from "../../shell/app";
import { can } from "../../shell/app";
import { head } from "../../shell/layout";
import { loadMeta, loadRoster, loadTerm, reset, S, type Term, terms, today } from "./state";
import { overviewMain, tasksMain } from "./overview";
import { detailMain, summaryMain } from "./timetable";
import { planMain } from "./plan";
import { rosterMain } from "./roster";
import { setupMain } from "./setup";
import { inputMain } from "./weekly";
import { statusMain } from "./status";
import { rulesMain } from "./rules";
import { dashMain } from "./dash";
import { focusMain } from "./focus";
import { alertBadge, alertsMain } from "./alerts";
import { navItem } from "../../shared/ui/icons";

type Need = "viewer" | "editor" | "admin";
const SCREENS: { key: string; label: string; group: string; icon: string; area: string; need: Need }[] = [
  { key: "overview", label: "대시보드", group: "운영", icon: "dashboard", area: "class", need: "viewer" },
  { key: "tasks", label: "업무 일정", group: "운영", icon: "tasks", area: "class", need: "viewer" },
  { key: "summary", label: "시간표 요약", group: "시간표", icon: "grid", area: "class", need: "viewer" },
  { key: "detail", label: "시간표 상세", group: "시간표", icon: "calendar", area: "class", need: "viewer" },
  { key: "math", label: "진도 수학", group: "진도", icon: "sigma", area: "class", need: "viewer" },
  { key: "science", label: "진도 과학", group: "진도", icon: "flask", area: "class", need: "viewer" },
  { key: "input", label: "성적 입력", group: "평가", icon: "pencil", area: "scores_weekly", need: "viewer" },
  { key: "status", label: "입력 현황", group: "평가", icon: "bars", area: "scores_weekly", need: "viewer" },
  { key: "dash", label: "평가 대시보드", group: "평가", icon: "trend", area: "scores_weekly", need: "viewer" },
  { key: "focus", label: "집중관리", group: "평가", icon: "target", area: "scores_weekly", need: "viewer" },
  { key: "alerts", label: "과목 경보", group: "평가", icon: "bell", area: "scores_weekly", need: "viewer" },
  { key: "rules", label: "평가 설정", group: "평가", icon: "sliders", area: "scores_weekly", need: "admin" },
  { key: "roster", label: "학생·반편성", group: "학생", icon: "users", area: "class", need: "viewer" },
  { key: "setup", label: "설정", group: "설정", icon: "gear", area: "class", need: "admin" },
];
const screensFor = (app: App) => SCREENS.filter((s) => can(app, s.area, s.need));

/** 기본 학기: 오늘이 들어 있는 학기 → 이미 시작한 학기 중 가장 늦은 것 → 마지막 학기 */
function pickTerm(ts: Term[]): Term | undefined {
  const now = today();
  return ts.find((t) => t.starts_on && t.ends_on && t.starts_on <= now && now <= t.ends_on)
    ?? ts.filter((t) => t.starts_on && t.starts_on <= now).at(-1)
    ?? ts.at(-1);
}

export function classView(app: App): View {
  if (S.ws !== app.ws) reset(app.ws);
  if (!S.meta && !S.metaErr) { void loadMeta(app); return { main: html`<div class="loading">불러오는 중…</div>` }; }
  if (S.metaErr) return { main: html`${head({ title: "수업" })}<div class="content"><div class="empty">${S.metaErr}</div></div>` };
  const m = S.meta!;
  const mine = screensFor(app);
  const [termPart, want, p1, p2] = app.route.parts;
  const screen = mine.some((s) => s.key === want) ? want : mine[0]?.key ?? "overview";
  const wantTerm = Number(termPart) || 0;
  const term = m.terms.find((t) => t.id === wantTerm) ?? null;
  if (!term) {
    const first = m.courses.find((c) => c.active) ?? m.courses[0];
    const t = first ? pickTerm(m.terms.filter((x) => x.course_id === first.id)) : undefined;
    if (t) { go(app.ws, "class", String(t.id), screen); return { main: html`<div class="loading">불러오는 중…</div>` }; }
    S.courseId = first?.id ?? 0; S.termId = 0;
    return { side: sideNav(app, "setup"), main: can(app, "class", "admin") ? setupMain(app) : html`${head({ title: "수업" })}<div class="content"><div class="empty">아직 과정·학기가 없습니다. 원장님께 요청하세요.</div></div>` };
  }
  if (S.termId !== term.id) { S.termId = term.id; S.courseId = term.course_id; S.term = null; }
  if (!S.term && S.termLoading !== term.id) void loadTerm(app, term.id);
  if (screen === "roster" && S.rosterCourse !== S.courseId) { S.roster = null; void loadRoster(app, S.courseId); }

  let main: TemplateResult;
  if (screen === "setup") main = setupMain(app);
  else if (screen === "roster") main = rosterMain(app);
  else if (!S.term) main = html`<div class="loading">불러오는 중…</div>`;
  else if (screen === "tasks") main = tasksMain(app);
  else if (screen === "summary") main = summaryMain(app);
  else if (screen === "detail") main = detailMain(app);
  else if (screen === "math" || screen === "science") main = planMain(app, screen === "math" ? "수학" : "과학");
  else if (screen === "input") main = inputMain(app, p1, p2);
  else if (screen === "status") main = statusMain(app);
  else if (screen === "rules") main = rulesMain(app);
  else if (screen === "dash") main = dashMain(app, p1, p2);
  else if (screen === "focus") main = focusMain(app);
  else if (screen === "alerts") main = alertsMain(app);
  else main = overviewMain(app);
  return { side: sideNav(app, screen), main };
}

function sideNav(app: App, screen: string): TemplateResult {
  const m = S.meta!;
  const courses = m.courses.filter((c) => c.active || c.id === S.courseId);
  const ts = terms();
  const pick = (courseId: number) => {
    const t = pickTerm(m.terms.filter((x) => x.course_id === courseId));
    if (t) go(app.ws, "class", String(t.id), screen);
  };
  let grp = "";
  return html`
    <div class="s1">
      <div class="lab">과정</div>
      <select class="sel" aria-label="과정" @change=${(e: Event) => pick(Number((e.target as HTMLSelectElement).value))}>
        ${courses.map((c) => html`<option value=${String(c.id)} ?selected=${c.id === S.courseId}>${c.name}</option>`)}
      </select>
      ${ts.length ? html`<div class="seg" role="tablist" aria-label="학기">${ts.map((t) => html`
        <button role="tab" class=${t.id === S.termId ? "on" : ""} title=${t.name}
          @click=${() => go(app.ws, "class", String(t.id), screen)}>${t.name.match(/^\[[^\]]+\]/)?.[0] ?? t.name}</button>`)}</div>` : nothing}
    </div>
    <div class="s2" aria-label="수업 화면">
      ${screensFor(app).map((s) => {
        const g = s.group !== grp ? html`<div class="grp">${(grp = s.group)}</div>` : nothing;
        return html`${g}${navItem({ href: S.termId ? href(app.ws, "class", String(S.termId), s.key) : "#", label: s.label, icon: s.icon, on: s.key === screen, badge: s.key === "alerts" && S.term ? alertBadge(app) : "" })}`;
      })}
    </div>
    <div class="s3"><span class="note">${ts.find((t) => t.id === S.termId)?.name ?? ""}</span></div>`;
}
