// 수업: 대시보드(다음 수업·반별 인원·할 일) + 업무 일정(날짜·내용·상태·비고)
import { html, nothing, type TemplateResult } from "lit-html";
import { live } from "lit-html/directives/live.js";
import { href } from "../../shared/core/route";
import { ask } from "../../shared/ui/ui";
import type { App } from "../../shell/app";
import { can } from "../../shell/app";
import { head } from "../../shell/layout";
import { classes, className, dlabel, type Ev, S, staffName, subjName, termCall, today } from "./state";

export function overviewMain(app: App): TemplateResult {
  const d = S.term!;
  const now = today();
  const next = d.sessions.filter((s) => s.kind === "class" && s.on_date >= now).slice(0, 4);
  const holidays = d.sessions.filter((s) => s.kind === "holiday" && s.on_date >= now);
  const todo = d.events.filter((e) => e.status === "todo");
  const total = d.sessions.filter((s) => s.kind === "class").length;
  const done = d.sessions.filter((s) => s.kind === "class" && s.on_date < now).length;
  const link = (k: string) => href(app.ws, "class", String(S.termId), k);
  return html`${head({ crumb: "수업", title: "대시보드" })}
  <div class="content">
    <div class="kpis">
      <div class="kpi"><div class="k">다음 수업</div><div class="v">${next[0] ? dlabel(next[0].on_date) : "—"}</div><div class="s">${next[0] ? `${next[0].start_t}~${next[0].end_t} · ${next[0].week_label}` : "예정된 수업 없음"}</div></div>
      <div class="kpi"><div class="k">진행한 회차</div><div class="v">${done} / ${total}</div><div class="s">시간표 상세 기준</div></div>
      <div class="kpi"><div class="k">남은 휴강</div><div class="v">${holidays.length}일</div><div class="s">${holidays[0] ? `${dlabel(holidays[0].on_date)} ${holidays[0].note}` : ""}</div></div>
      <div class="kpi"><div class="k">진행 중인 업무</div><div class="v">${todo.length}건</div><div class="s"><a href=${link("tasks")}>업무 일정 보기</a></div></div>
    </div>
    <div class="two">
      <div class="card"><div class="ch"><h3>다가오는 수업</h3><div class="sp"></div><a class="btn sm" href=${link("detail")}>시간표 상세</a></div>
        ${next.length ? html`<table class="t"><thead><tr><th>날짜</th><th>시간</th>${classes().map((c) => html`<th>${c.name}</th>`)}</tr></thead><tbody>
          ${next.map((s) => html`<tr><td>${dlabel(s.on_date)}<div class="note">${s.week_label}</div></td><td>${s.start_t}~${s.end_t}</td>
            ${classes().map((c) => { const x = s.cells.find((y) => y.class_id === c.id); return html`<td>${x ? html`<b>${subjName(x.subject_id)}</b><div class="note">${staffName(x.staff_id)}</div>` : ""}</td>`; })}</tr>`)}
        </tbody></table>` : html`<div class="empty">예정된 수업이 없습니다.</div>`}
      </div>
      <div class="card"><div class="ch"><h3>진행 중인 업무</h3></div>
        ${todo.length ? html`<ul class="tl" style="padding:12px 16px;margin:0">${todo.slice(0, 8).map((e) => html`<li><div class="d">${dlabel(e.on_date)}</div><div class="t">${e.important ? "★ " : ""}${e.title}</div></li>`)}</ul>`
          : html`<div class="empty" style="padding:30px">모두 완료했습니다.</div>`}
      </div>
    </div>
    <div class="note" style="margin-top:12px">반: ${classes().map((c) => className(c.id)).join(" · ") || "없음"}</div>
  </div>`;
}

export function tasksMain(app: App): TemplateResult {
  const d = S.term!;
  const ed = can(app, "class", "editor");
  const save = (e: Ev, patch: Partial<Ev>) => termCall(app, "eventSave", { ...e, ...patch });
  const row = (e: Ev) => html`<tr>
    <td style="width:130px">${ed ? html`<input type="date" class="sel" .value=${live(e.on_date)} @change=${(x: Event) => save(e, { on_date: (x.target as HTMLInputElement).value })}>` : dlabel(e.on_date)}</td>
    <td>${ed ? html`<textarea class="cellta" rows="1" .value=${live(e.title)} @change=${(x: Event) => save(e, { title: (x.target as HTMLTextAreaElement).value })}></textarea>` : e.title}</td>
    <td style="width:110px;text-align:center"><button class="chip ${e.status === "done" ? "ok" : "warn"}" ?disabled=${!ed} aria-label="상태 바꾸기"
      @click=${() => save(e, { status: e.status === "done" ? "todo" : "done" })}>${e.status === "done" ? "🟢 완료" : "🟡 진행 중"}</button></td>
    <td style="width:220px">${ed ? html`<input class="sel" .value=${live(e.note)} @change=${(x: Event) => save(e, { note: (x.target as HTMLInputElement).value })}>` : e.note}</td>
    <td style="width:80px;text-align:center">
      <button class="star ${e.important ? "on" : ""}" ?disabled=${!ed} title="중요 표시" aria-label="중요 표시" @click=${() => save(e, { important: !e.important })}>★</button>
      ${ed ? html`<button class="btn sm bad" aria-label="삭제" @click=${async () => { if (await ask("업무 삭제", `${dlabel(e.on_date)} '${e.title}' 을(를) 지울까요?`, "삭제")) await termCall(app, "eventSave", { id: e.id, remove: true }, "지웠습니다."); }}>✕</button>` : nothing}
    </td></tr>`;
  return html`${head({ crumb: "수업", title: "업무 일정", chips: html`<span class="chip">${d.events.length}건</span>`,
    actions: ed ? html`<button class="btn pri" @click=${() => termCall(app, "eventSave", { on_date: today(), title: "" }, "줄을 추가했습니다.")}>+ 내용 추가</button>` : undefined })}
  <div class="content"><div class="card" style="overflow:auto">
    <table class="t"><thead><tr><th>날짜</th><th>내용</th><th style="text-align:center">상태</th><th>비고</th><th></th></tr></thead>
    <tbody>${d.events.length ? d.events.map(row) : html`<tr><td colspan="5" class="empty">업무 일정이 없습니다.</td></tr>`}</tbody></table>
  </div><div class="note" style="margin-top:8px">칸을 고치고 다른 곳을 누르면 바로 저장됩니다. 상태를 누르면 진행 중 ↔ 완료가 바뀝니다.</div></div>`;
}
