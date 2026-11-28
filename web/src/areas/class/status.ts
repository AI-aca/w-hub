// 수업 › 평가 › 입력 현황(회차 × 반, 입력한 학생 수/수강생 수)
import { html, nothing, type TemplateResult } from "lit-html";
import { api } from "../../shared/core/api";
import { go } from "../../shared/core/route";
import { downloadXlsx, type Sheet } from "../../shared/core/xlsx";
import { errMsg, toast } from "../../shared/ui/ui";
import type { App } from "../../shell/app";
import { head } from "../../shell/layout";
import { classes, dlabel, S, today } from "./state";
import { weeklyDirty } from "./weekly";

const T = { term: 0, dirty: -1, rows: null as { session_id: number; class_id: number; total: number; filled: number }[] | null };

async function loadStatus(app: App): Promise<void> {
  T.term = S.termId; T.dirty = weeklyDirty.n; T.rows = null;
  try { T.rows = (await api<{ rows: NonNullable<typeof T.rows> }>("weeklyStatus", { term_id: S.termId })).rows; } catch (e) { toast(errMsg(e), "bad"); T.rows = []; }
  app.redraw();
}

/** 엑셀 백업: 서버가 시트 자료를 주면 브라우저에서 .xlsx 로 만들어 내려받는다(연락처는 안 들어감). */
async function backup(app: App): Promise<void> {
  try {
    const d = await api<{ term: string; sheets: Sheet[] }>("weeklyBackup", { term_id: S.termId });
    const t = new Date(), p = (n: number) => String(n).padStart(2, "0");
    const name = `주말반_${d.term.replace(/[\\/:*?"<>|]/g, " ").trim() || "학기"}_백업_${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}.xlsx`;
    downloadXlsx(name, d.sheets);
    toast(`${name} 을(를) 내려받습니다.`, "ok");
  } catch (e) { toast(errMsg(e), "bad"); }
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
    actions: html`<button class="btn" @click=${() => void backup(app)}>엑셀로 내보내기 (백업)</button><button class="btn" @click=${() => void loadStatus(app)}>새로 고침</button>` })}
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
