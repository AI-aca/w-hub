// 관리(원장 전용): 계정·권한 / 센터 / 로그
import { html, nothing } from "lit-html";
import { api } from "../../core/api";
import { ago, errMsg, fmtDateTime, toast } from "../../core/ui";
import { ROLE_LABEL, type AdminUser, type Center, type Membership, type ModuleInfo, type Workspace } from "../../core/types";
import { href } from "../router";
import { state, update } from "../state";

interface AdminData { users: AdminUser[]; modules: ModuleInfo[]; workspaces: Workspace[]; centers: Center[] }
interface LogRow { id: number; at: string; email: string; name: string; workspace_id: string | null; module_key: string | null; action: string; detail: Record<string, unknown> }

const S: {
  data: AdminData | null; loading: boolean; filter: "all" | "pending" | "approved" | "blocked"; search: string;
  draft: (AdminUser & { isNew?: boolean }) | null; saving: boolean;
  logs: LogRow[]; logActions: string[]; logQ: string; logAction: string; logLoading: boolean;
} = { data: null, loading: false, filter: "all", search: "", draft: null, saving: false,
  logs: [], logActions: [], logQ: "", logAction: "", logLoading: false };

const STATUS_LABEL = { approved: "승인", pending: "승인 대기", blocked: "차단" } as const;

export async function loadAdmin(): Promise<void> {
  S.loading = true; update();
  try {
    S.data = await api<AdminData & { ok: true }>("userList");
    state.pendingCount = S.data.users.filter((u) => u.status === "pending").length;
  } catch (e) { toast(errMsg(e), "err"); }
  S.loading = false; update();
}

export async function loadLogs(): Promise<void> {
  S.logLoading = true; update();
  try {
    const r = await api<{ rows: LogRow[]; actions: string[] }>("logList", { q: S.logQ, filter_action: S.logAction });
    S.logs = r.rows; S.logActions = r.actions;
  } catch (e) { toast(errMsg(e), "err"); }
  S.logLoading = false; update();
}

function tabs(page: string) {
  const t = (p: "users" | "centers" | "logs", label: string) =>
    html`<a class=${"tab" + (page === p ? " on" : "")} href=${href.admin(p)}>${label}</a>`;
  return html`<nav class="subtabs">${t("users", "계정·권한")}${t("centers", "센터")}${t("logs", "로그")}</nav>`;
}

export function adminView(page: "users" | "centers" | "logs") {
  return html`<section class="page">
    <header class="page-head"><div><p class="eyebrow">관리 · 원장 전용</p><h1>${page === "users" ? "계정·권한" : page === "centers" ? "센터" : "로그"}</h1></div></header>
    ${tabs(page)}
    ${page === "users" ? usersView() : page === "centers" ? centersView() : logsView()}
  </section>`;
}

/* ---------------- 계정·권한 ---------------- */
function summary(u: AdminUser, d: AdminData) {
  if (u.is_owner) return html`<span class="pill owner">원장 · 전체</span>`;
  if (!u.memberships.length) return html`<span class="muted">권한 없음</span>`;
  return u.memberships.map((m) => {
    const mod = d.modules.find((x) => x.workspace_id === m.workspace_id && x.module_key === m.module_key);
    const ws = d.workspaces.find((w) => w.id === m.workspace_id);
    const c = m.center_ids ? " · " + m.center_ids.map((id) => d.centers.find((x) => x.id === id)?.name ?? "?").join("+") : "";
    return html`<span class="pill">${ws?.name} ${mod?.name ?? m.module_key} · ${ROLE_LABEL[m.role]}${c}</span>`;
  });
}

function usersView() {
  const d = S.data;
  if (!d) return html`<div class="empty">${S.loading ? "불러오는 중…" : "자료가 없습니다."}</div>`;
  const q = S.search.trim().toLowerCase();
  const list = d.users.filter((u) => (S.filter === "all" || u.status === S.filter) &&
    (!q || u.email.includes(q) || u.name.toLowerCase().includes(q)));
  const count = (s: string) => d.users.filter((u) => u.status === s).length;
  return html`
    <div class="toolbar">
      <div class="seg">
        ${(["all", "pending", "approved", "blocked"] as const).map((f) => html`<button class=${S.filter === f ? "on" : ""}
          @click=${() => { S.filter = f; update(); }}>${f === "all" ? `전체 ${d.users.length}` : `${STATUS_LABEL[f]} ${count(f)}`}</button>`)}
      </div>
      <input class="input" type="search" placeholder="이름·이메일 검색" .value=${S.search}
        @input=${(e: Event) => { S.search = (e.target as HTMLInputElement).value; update(); }}>
      <span class="sp"></span>
      <button class="btn primary" @click=${() => openDraft(null)}>+ 계정 추가</button>
    </div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th style="width:150px">이름</th><th>이메일</th><th style="width:90px">상태</th><th>권한</th><th style="width:90px">최근 접속</th></tr></thead>
      <tbody>
        ${list.length === 0 ? html`<tr><td colspan="5" class="empty-row">해당하는 계정이 없습니다.</td></tr>` : list.map((u) => html`
          <tr class="click" @click=${() => openDraft(u)}>
            <td><b>${u.name || "-"}</b></td>
            <td class="mono">${u.email}</td>
            <td><span class=${"status " + u.status}>${STATUS_LABEL[u.status]}</span></td>
            <td class="pills">${summary(u, d)}</td>
            <td class="muted">${ago(u.last_seen ?? u.last_login)}</td>
          </tr>`)}
      </tbody>
    </table></div>
    ${S.draft ? drawer(S.draft, d) : nothing}`;
}

function openDraft(u: AdminUser | null): void {
  S.draft = u ? structuredClone(u) : { email: "", name: "", is_owner: false, status: "approved", created_at: "", last_login: null,
    last_seen: null, memberships: [], isNew: true };
  update();
}

function setMembership(ws: string, key: string, role: string): void {
  const dr = S.draft!;
  const i = dr.memberships.findIndex((m) => m.workspace_id === ws && m.module_key === key);
  if (role === "") { if (i >= 0) dr.memberships.splice(i, 1); }
  else if (i >= 0) dr.memberships[i].role = role as Membership["role"];
  else dr.memberships.push({ workspace_id: ws, module_key: key, role: role as Membership["role"], center_ids: null });
  update();
}

function toggleCenter(m: Membership, id: number | "all"): void {
  if (id === "all") m.center_ids = m.center_ids ? null : [];
  else {
    const set = new Set(m.center_ids ?? []);
    if (set.has(id)) set.delete(id); else set.add(id);
    m.center_ids = [...set];
  }
  update();
}

function drawer(dr: AdminUser & { isNew?: boolean }, d: AdminData) {
  const self = state.phase.kind === "ready" && state.phase.me.user.email === dr.email;
  const close = () => { S.draft = null; update(); };
  return html`<div class="overlay" @click=${(e: Event) => { if (e.target === e.currentTarget) close(); }}>
    <aside class="drawer" role="dialog" aria-label="계정 편집">
      <header class="drawer-head"><h2>${dr.isNew ? "계정 추가" : "계정 편집"}</h2><button class="x" @click=${close} aria-label="닫기">×</button></header>
      <div class="drawer-body">
        <div class="grid2">
          <label class="field"><span>구글 이메일</span>
            <input class="input" type="email" .value=${dr.email} ?disabled=${!dr.isNew} placeholder="name@gmail.com"
              @input=${(e: Event) => { dr.email = (e.target as HTMLInputElement).value.trim().toLowerCase(); }}></label>
          <label class="field"><span>이름</span>
            <input class="input" .value=${dr.name} placeholder="표시 이름"
              @input=${(e: Event) => { dr.name = (e.target as HTMLInputElement).value; }}></label>
          <label class="field"><span>상태</span>
            <select class="input" .value=${dr.status} ?disabled=${self}
              @change=${(e: Event) => { dr.status = (e.target as HTMLSelectElement).value as AdminUser["status"]; update(); }}>
              <option value="approved">승인</option><option value="pending">승인 대기</option><option value="blocked">차단</option>
            </select></label>
          <label class="field check"><input type="checkbox" .checked=${dr.is_owner} ?disabled=${self}
              @change=${(e: Event) => { dr.is_owner = (e.target as HTMLInputElement).checked; update(); }}>
            <span>원장 권한 <small>(두 작업공간 전체 + 계정 관리)</small></span></label>
        </div>

        ${dr.is_owner ? html`<p class="info">원장 계정은 모든 작업공간·모듈·센터를 관리합니다. 아래 권한은 쓰지 않습니다.</p>` :
        d.workspaces.map((ws) => html`<section class="perm-ws">
          <h3>${ws.name}</h3>
          ${d.modules.filter((m) => m.workspace_id === ws.id).map((mod) => {
            const mem = dr.memberships.find((m) => m.workspace_id === ws.id && m.module_key === mod.module_key);
            const centers = d.centers.filter((c) => c.workspace_id === ws.id && c.active !== false);
            return html`<div class="perm-row">
              <div class="perm-name">${mod.name}</div>
              <div class="seg small">
                ${(["", "viewer", "editor", "admin"] as const).map((r) => html`<button class=${(mem?.role ?? "") === r ? "on" : ""}
                  @click=${() => setMembership(ws.id, mod.module_key, r)}>${r === "" ? "없음" : ROLE_LABEL[r]}</button>`)}
              </div>
              ${mem && mod.uses_centers ? html`<div class="centers">
                <label class="cchip"><input type="checkbox" .checked=${mem.center_ids === null} @change=${() => toggleCenter(mem, "all")}>전체 센터</label>
                ${mem.center_ids !== null ? centers.map((c) => html`<label class="cchip"><input type="checkbox"
                  .checked=${mem.center_ids!.includes(c.id)} @change=${() => toggleCenter(mem, c.id)}>${c.name}</label>`) : nothing}
              </div>` : nothing}
            </div>`;
          })}
        </section>`)}
      </div>
      <footer class="drawer-foot">
        ${!dr.isNew && !self ? html`<button class="btn danger ghost" @click=${() => removeUser(dr)}>계정 삭제</button>` : nothing}
        <span class="sp"></span>
        <button class="btn" @click=${close}>취소</button>
        <button class="btn primary" ?disabled=${S.saving} @click=${() => saveDraft(dr)}>${S.saving ? "저장 중…" : "저장"}</button>
      </footer>
    </aside>
  </div>`;
}

async function saveDraft(dr: AdminUser): Promise<void> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dr.email)) { toast("이메일을 확인하세요.", "err"); return; }
  const bad = dr.memberships.find((m) => Array.isArray(m.center_ids) && m.center_ids.length === 0);
  if (bad && !dr.is_owner) { toast("센터를 하나 이상 고르거나 '전체 센터'로 두세요.", "err"); return; }
  S.saving = true; update();
  try {
    await api("userSave", { email: dr.email, name: dr.name, status: dr.status, is_owner: dr.is_owner,
      memberships: dr.is_owner ? [] : dr.memberships });
    toast("저장했습니다.", "ok");
    S.draft = null;
    await loadAdmin();
  } catch (e) { toast(errMsg(e), "err"); }
  S.saving = false; update();
}

async function removeUser(dr: AdminUser): Promise<void> {
  if (!confirm(`${dr.name || dr.email} 계정을 삭제할까요?\n권한도 함께 지워집니다.`)) return;
  try {
    await api("userDelete", { email: dr.email });
    toast("삭제했습니다.", "ok");
    S.draft = null;
    await loadAdmin();
  } catch (e) { toast(errMsg(e), "err"); }
}

/* ---------------- 센터 ---------------- */
function centersView() {
  const d = S.data;
  if (!d) return html`<div class="empty">${S.loading ? "불러오는 중…" : "자료가 없습니다."}</div>`;
  return html`<div class="cols">${d.workspaces.map((ws) => {
    const list = d.centers.filter((c) => c.workspace_id === ws.id);
    return html`<section class="panel">
      <h3>${ws.name}</h3>
      <ul class="center-list">
        ${list.map((c) => html`<li class=${c.active === false ? "off" : ""}>
          <input class="input" .value=${c.name} @change=${(e: Event) => saveCenter({ ...c, name: (e.target as HTMLInputElement).value })}>
          <label class="cchip"><input type="checkbox" .checked=${c.active !== false}
            @change=${(e: Event) => saveCenter({ ...c, active: (e.target as HTMLInputElement).checked })}>사용</label>
        </li>`)}
      </ul>
      <form class="add-row" @submit=${(e: Event) => { e.preventDefault(); const f = e.target as HTMLFormElement; const i = f.elements.namedItem("n") as HTMLInputElement;
        if (i.value.trim()) saveCenter({ id: undefined as unknown as number, workspace_id: ws.id, name: i.value.trim(), sort: list.length + 1 }).then(() => { i.value = ""; }); }}>
        <input class="input" name="n" placeholder="새 센터 이름"><button class="btn">추가</button>
      </form>
    </section>`;
  })}</div>
  <p class="hint">센터는 내신·생기부처럼 센터별로 나뉘는 모듈의 권한에 쓰입니다. 사용을 끄면 권한 선택에서 숨겨집니다.</p>`;
}

async function saveCenter(c: Partial<Center> & { workspace_id: string; name: string }): Promise<void> {
  try {
    await api("centerSave", { id: c.id ?? null, workspace_id: c.workspace_id, name: c.name, sort: c.sort ?? 0, active: c.active !== false });
    toast("센터를 저장했습니다.", "ok");
    await loadAdmin();
  } catch (e) { toast(errMsg(e), "err"); await loadAdmin(); }
}

/* ---------------- 로그 ---------------- */
function detailText(r: LogRow): string {
  const d = r.detail ?? {};
  return Object.entries(d).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ");
}

function logsView() {
  return html`
    <div class="toolbar">
      <select class="input" .value=${S.logAction} @change=${(e: Event) => { S.logAction = (e.target as HTMLSelectElement).value; loadLogs(); }}>
        <option value="">모든 동작</option>${S.logActions.map((a) => html`<option .value=${a} ?selected=${a === S.logAction}>${a}</option>`)}
      </select>
      <input class="input" type="search" placeholder="이름·이메일·내용 검색" .value=${S.logQ}
        @input=${(e: Event) => { S.logQ = (e.target as HTMLInputElement).value; }}
        @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter") loadLogs(); }}>
      <button class="btn" @click=${loadLogs}>검색</button>
      <span class="sp"></span><span class="muted">최근 500건</span>
    </div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th style="width:140px">일시</th><th style="width:160px">사용자</th><th style="width:110px">동작</th><th>내용</th></tr></thead>
      <tbody>${S.logLoading && !S.logs.length ? html`<tr><td colspan="4" class="empty-row">불러오는 중…</td></tr>` :
        S.logs.length === 0 ? html`<tr><td colspan="4" class="empty-row">기록이 없습니다.</td></tr>` :
        S.logs.map((r) => html`<tr><td class="muted">${fmtDateTime(r.at)}</td><td><b>${r.name || "-"}</b><br><small class="mono muted">${r.email}</small></td>
          <td>${r.action}</td><td class="detail">${detailText(r)}</td></tr>`)}</tbody>
    </table></div>`;
}
