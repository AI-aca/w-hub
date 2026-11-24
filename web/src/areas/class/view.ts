// 수업(주말반): 왼쪽 = 과정·학기·화면 목록, 오른쪽 = 고른 화면.
// 주소: #/weiz/class/<학기 id>/<화면>  화면 = overview · tasks · summary · detail · math · science · roster · setup
import { html, nothing, type TemplateResult } from "lit-html";
import { go, href } from "../../shared/core/route";
import type { App, View } from "../../shell/app";
import { can } from "../../shell/app";
import { head } from "../../shell/layout";
import { loadMeta, loadRoster, loadTerm, reset, S, terms } from "./state";
import { overviewMain, tasksMain } from "./overview";
import { detailMain, summaryMain } from "./timetable";
import { planMain } from "./plan";
import { rosterMain } from "./roster";
import { setupMain } from "./setup";

const SCREENS: { key: string; label: string; group: string }[] = [
  { key: "overview", label: "대시보드", group: "운영" },
  { key: "tasks", label: "업무 일정", group: "운영" },
  { key: "summary", label: "시간표 요약", group: "시간표" },
  { key: "detail", label: "시간표 상세", group: "시간표" },
  { key: "math", label: "진도 수학", group: "진도" },
  { key: "science", label: "진도 과학", group: "진도" },
  { key: "roster", label: "학생·반편성", group: "학생" },
  { key: "setup", label: "설정", group: "설정" },
];

export function classView(app: App): View {
  if (S.ws !== app.ws) reset(app.ws);
  if (!S.meta && !S.metaErr) { void loadMeta(app); return { main: html`<div class="loading">불러오는 중…</div>` }; }
  if (S.metaErr) return { main: html`${head({ title: "수업" })}<div class="content"><div class="empty">${S.metaErr}</div></div>` };
  const m = S.meta!;
  const [termPart, screen = "overview"] = app.route.parts;
  const wantTerm = Number(termPart) || 0;
  const term = m.terms.find((t) => t.id === wantTerm) ?? null;
  if (!term) {
    const first = m.courses.find((c) => c.active) ?? m.courses[0];
    const t = first ? m.terms.filter((x) => x.course_id === first.id).at(-1) : undefined;
    if (t) { go(app.ws, "class", String(t.id), "overview"); return { main: html`<div class="loading">불러오는 중…</div>` }; }
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
  else main = overviewMain(app);
  return { side: sideNav(app, screen), main };
}

function sideNav(app: App, screen: string): TemplateResult {
  const m = S.meta!;
  const courses = m.courses.filter((c) => c.active || c.id === S.courseId);
  const ts = terms();
  const pick = (courseId: number) => {
    const t = m.terms.filter((x) => x.course_id === courseId).at(-1);
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
      ${SCREENS.filter((s) => s.key !== "setup" || can(app, "class", "admin")).map((s) => {
        const g = s.group !== grp ? html`<div class="grp">${(grp = s.group)}</div>` : nothing;
        return html`${g}<a class="item ${s.key === screen ? "on" : ""}" href=${S.termId ? href(app.ws, "class", String(S.termId), s.key) : "#"}>${s.label}</a>`;
      })}
    </div>
    <div class="s3"><span class="note">${ts.find((t) => t.id === S.termId)?.name ?? ""}</span></div>`;
}
