// 관리(원장): 계정·권한 / 센터·학교·강사 / 변경 기록
import { html, nothing, type TemplateResult } from "lit-html";
import { api } from "../../shared/core/api";
import { href } from "../../shared/core/route";
import type { AreaDef, Center, Role, Workspace } from "../../shared/core/types";
import { ROLE_KO } from "../../shared/core/types";
import { ask, errMsg, openDialog, toast, ymdhm } from "../../shared/ui/ui";
import { navItem } from "../../shared/ui/icons";
import { type Col, table, type TableState } from "../../shared/ui/table";
import type { App, View } from "../../shell/app";
import { head } from "../../shell/layout";

interface Mem { workspace_id: string; area: string; role: Exclude<Role, "owner">; center_ids: number[] | null }
interface User { email: string; name: string; is_owner: boolean; status: "approved" | "pending" | "blocked"; created_at: string; last_login: string | null; last_seen: string | null; memberships: Mem[] }
interface Users { users: User[]; areas: AreaDef[]; workspaces: Workspace[]; centers: (Center & { active: boolean })[] }
interface Org { centers: { id: number; name: string; sort: number; active: boolean }[]; schools: { id: number; center_id: number | null; name: string; level: string; sort: number; active: boolean }[]; staff: { id: string; name: string; email: string | null; phone: string; subjects: string[]; memo: string; active: boolean }[] }
interface Log { id: number; at: string; email: string; name: string; workspace_id: string | null; area: string | null; action: string; detail: Record<string, unknown> }

const STATUS_KO = { approved: "승인", pending: "승인 대기", blocked: "차단" } as const;
const S = {
  users: null as Users | null, org: null as Org | null, orgWs: "", logs: null as { rows: Log[]; actions: string[] } | null,
  q: "", act: "", tU: { sort: "status", desc: false } as TableState, tL: { sort: "at", desc: true } as TableState,
};

const loadUsers = async (app: App) => { try { S.users = await api<Users>("userList"); } catch (e) { toast(errMsg(e), "bad"); } app.redraw(); };
const loadOrg = async (app: App) => { S.orgWs = app.ws; try { S.org = await api<Org>("orgList"); } catch (e) { toast(errMsg(e), "bad"); } app.redraw(); };
const loadLogs = async (app: App) => { try { S.logs = await api("logList", { q: S.q, filter_action: S.act }); } catch (e) { toast(errMsg(e), "bad"); } app.redraw(); };

export function adminView(app: App): View {
  const sub = app.route.parts[0] ?? "users";
  const items = [["users", "계정·권한", "shield"], ["org", "센터·학교·강사", "building"], ["logs", "변경 기록", "history"]];
  const pending = S.users?.users.filter((u) => u.status === "pending").length || "";
  const side = html`<div class="s1"><div class="lab">관리</div><div class="note">원장 계정만 보입니다.</div></div>
    <div class="s2">${items.map(([k, n, ic]) => navItem({ href: href(app.ws, "admin", k), label: n, icon: ic, on: k === sub, badge: k === "users" ? pending : "" }))}</div>`;
  let main: TemplateResult;
  if (sub === "org") {
    if (S.orgWs !== app.ws) { S.org = null; void loadOrg(app); }
    main = orgMain(app);
  } else if (sub === "logs") {
    if (!S.logs) void loadLogs(app);
    main = logsMain(app);
  } else {
    if (!S.users) void loadUsers(app);
    main = usersMain(app);
  }
  return { side, main };
}

// 계정·권한 -------------------------------------------------------------
function usersMain(app: App): TemplateResult {
  const d = S.users;
  const aname = (m: Mem) => d?.areas.find((a) => a.workspace_id === m.workspace_id && a.area === m.area)?.name ?? m.area;
  const wname = (id: string) => d?.workspaces.find((w) => w.id === id)?.name ?? id;
  const cols: Col<User>[] = [
    { key: "status", label: "상태", value: (u) => ({ pending: 0, approved: 1, blocked: 2 })[u.status],
      cell: (u) => html`<span class="chip ${u.status === "pending" ? "warn" : u.status === "blocked" ? "bad" : "ok"}">${STATUS_KO[u.status]}</span>` },
    { key: "name", label: "이름", value: (u) => u.name, cell: (u) => html`<b>${u.name || "(이름 없음)"}</b>${u.is_owner ? html` <span class="chip info">원장</span>` : nothing}` },
    { key: "email", label: "이메일", value: (u) => u.email },
    { key: "perm", label: "권한", value: (u) => u.memberships.length,
      cell: (u) => u.is_owner ? "전체" : u.memberships.length ? html`${u.memberships.map((m) => html`<span class="chip" style="margin:1px">${wname(m.workspace_id)} ${aname(m)} ${ROLE_KO[m.role]}</span>`)}` : html`<span class="note">없음</span>` },
    { key: "seen", label: "최근 접속", value: (u) => u.last_seen ?? "", cell: (u) => ymdhm(u.last_seen) },
  ];
  return html`${head({ crumb: "관리", title: "계정·권한", actions: html`<button class="btn pri" @click=${() => editUser(app, null)}>+ 계정 추가</button>` })}
    <div class="content">
      <p class="note" style="margin-top:0">처음 로그인한 선생님은 '승인 대기'로 들어옵니다. 눌러서 승인하고, 쓸 영역(학생·성적·수업…)과 권한 단계를 정하세요. 한 사람이 여러 영역을 가질 수 있습니다.</p>
      <div class="card" style="overflow:auto">${d ? table(d.users, cols, S.tU, { redraw: app.redraw, onRow: (u) => editUser(app, u) }) : html`<div class="loading">불러오는 중…</div>`}</div>
    </div>`;
}

function editUser(app: App, u: User | null): void {
  const d = S.users;
  if (!d) return;
  const f = {
    email: u?.email ?? "", name: u?.name ?? "", status: (u?.status === "pending" ? "approved" : (u?.status ?? "approved")) as User["status"],
    is_owner: u?.is_owner ?? false,
    mem: new Map<string, Mem>((u?.memberships ?? []).map((m) => [m.workspace_id + "/" + m.area, { ...m }])),
  };
  let busy = false;
  const row = (a: AreaDef, redraw: () => void) => {
    const k = a.workspace_id + "/" + a.area;
    const m = f.mem.get(k);
    const setRole = (r: Mem["role"] | "") => {
      if (!r) f.mem.delete(k); else f.mem.set(k, { workspace_id: a.workspace_id, area: a.area, role: r, center_ids: m?.center_ids ?? null });
      redraw();
    };
    const cens = d.centers.filter((c) => c.workspace_id === a.workspace_id && c.active);
    const togC = (id: number | null) => {
      if (!m) return;
      if (id == null) m.center_ids = null;
      else {
        const s = new Set(m.center_ids ?? []);
        if (s.has(id)) s.delete(id); else s.add(id);
        m.center_ids = s.size ? [...s] : null;
      }
      redraw();
    };
    return html`<div class="perm-row" data-area=${a.area}>
      <div><b>${a.name}</b>${a.ready ? nothing : html`<span class="soon">옮기는 중</span>`}</div>
      <div class="seg" role="group" aria-label=${a.name + " 권한"}>${(["", "viewer", "editor", "admin"] as const).map((r) => html`
        <button type="button" class=${(m?.role ?? "") === r ? "on" : ""} @click=${() => setRole(r)}>${r ? ROLE_KO[r] : "없음"}</button>`)}</div>
      <div class="cens">${a.uses_centers && m ? html`<button type="button" class=${m.center_ids ? "" : "on"} @click=${() => togC(null)}>전체 센터</button>
        ${cens.map((c) => html`<button type="button" class=${m.center_ids?.includes(c.id) ? "on" : ""} @click=${() => togC(c.id)}>${c.name}</button>`)}` : nothing}</div>
    </div>`;
  };
  const save = async (close: () => void, redraw: () => void) => {
    busy = true; redraw();
    try {
      await api("userSave", { email: f.email, name: f.name, status: f.status, is_owner: f.is_owner, memberships: [...f.mem.values()] });
      toast("저장했습니다. 다음 접속부터 바뀐 권한이 적용됩니다.", "ok");
      close();
      await loadUsers(app);
      if (f.email === app.me.user.email) await app.reloadMe();
    } catch (e) { toast(errMsg(e), "bad"); busy = false; redraw(); }
  };
  const del = async (close: () => void) => {
    if (!u || !(await ask("계정 삭제", `${u.email} 계정을 삭제할까요? 이 사람이 입력한 자료는 남습니다.`, "삭제"))) return;
    try { await api("userDelete", { email: u.email }); toast("삭제했습니다.", "ok"); close(); await loadUsers(app); } catch (e) { toast(errMsg(e), "bad"); }
  };
  openDialog(u ? "계정 편집" : "계정 추가", (close, redraw) => html`<div class="db">
      <div class="form">
        <label class="fld"><span>이메일(구글 계정)</span><input .value=${f.email} ?disabled=${!!u} @input=${(e: Event) => { f.email = (e.target as HTMLInputElement).value; }}></label>
        <label class="fld"><span>이름</span><input .value=${f.name} @input=${(e: Event) => { f.name = (e.target as HTMLInputElement).value; }}></label>
        <label class="fld"><span>상태</span><select aria-label="상태" @change=${(e: Event) => { f.status = (e.target as HTMLSelectElement).value as User["status"]; }}>
          ${(["approved", "pending", "blocked"] as const).map((s) => html`<option value=${s} ?selected=${f.status === s}>${STATUS_KO[s]}</option>`)}</select></label>
        <label class="fld"><span>원장 권한</span><span style="display:flex;gap:6px;align-items:center;height:34px"><input type="checkbox" style="height:auto" .checked=${f.is_owner}
          @change=${(e: Event) => { f.is_owner = (e.target as HTMLInputElement).checked; redraw(); }}>모든 영역·관리 메뉴</span></label>
      </div>
      ${f.is_owner ? html`<p class="note">원장은 모든 영역을 다 씁니다.</p>` : d.workspaces.map((w) => html`<div class="perm-ws" data-ws=${w.id}><h4>${w.name}</h4>
        ${d.areas.filter((a) => a.workspace_id === w.id).map((a) => row(a, redraw))}</div>`)}
      <p class="note" style="margin-bottom:0">열람 = 보기만 · 입력 = 입력·수정 · 관리 = 보관·설정까지. 센터를 고르면 그 센터 학생만 보입니다.</p>
    </div>
    <div class="df">${u ? html`<button class="btn bad" style="margin-right:auto" @click=${() => del(close)}>삭제</button>` : nothing}
      <button class="btn" @click=${close}>취소</button><button class="btn pri" ?disabled=${busy} @click=${() => save(close, redraw)}>저장</button></div>`);
}

// 센터·학교·강사 ----------------------------------------------------------
function orgMain(app: App): TemplateResult {
  const o = S.org;
  const ws = app.me.workspaces.find((w) => w.id === app.ws)?.name ?? "";
  if (!o) return html`${head({ crumb: "관리", title: "센터·학교·강사" })}<div class="loading">불러오는 중…</div>`;
  const cn = (id: number | null) => o.centers.find((c) => c.id === id)?.name ?? "—";
  const off = (a: boolean) => a ? nothing : html` <span class="chip">사용 안 함</span>`;
  return html`${head({ crumb: "관리 · " + ws, title: "센터·학교·강사", chips: html`<span class="chip">${ws} 것만 보입니다</span>` })}
  <div class="content" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:start">
    <div class="card"><div class="ch"><h3>센터</h3><div class="sp"></div><button class="btn sm" @click=${() => editOrg(app, "center", null)}>+ 추가</button></div>
      <div class="cb" style="padding:4px 8px">${o.centers.map((c) => html`<a class="item" @click=${() => editOrg(app, "center", c)}>${c.name}${off(c.active)}</a>`)}</div></div>
    <div class="card"><div class="ch"><h3>학교</h3><div class="sp"></div><button class="btn sm" @click=${() => editOrg(app, "school", null)}>+ 추가</button></div>
      <div class="cb" style="padding:4px 8px">${o.schools.length ? o.schools.map((s) => html`<a class="item" @click=${() => editOrg(app, "school", s)}>${s.name}${off(s.active)}<small>${s.level} · ${cn(s.center_id)}</small></a>`) : html`<div class="note" style="padding:8px">내신 자료를 옮겨 올 때 함께 채워집니다.</div>`}</div></div>
    <div class="card"><div class="ch"><h3>강사</h3><div class="sp"></div><button class="btn sm" @click=${() => editOrg(app, "staff", null)}>+ 추가</button></div>
      <div class="cb" style="padding:4px 8px">${o.staff.length ? o.staff.map((s) => html`<a class="item" @click=${() => editOrg(app, "staff", s)}>${s.name}${off(s.active)}<small>${s.subjects.join("·")}</small></a>`) : html`<div class="note" style="padding:8px">주말반 강사 명단을 옮겨 올 때 함께 채워집니다.</div>`}</div></div>
  </div>`;
}

type OrgKind = "center" | "school" | "staff";
function editOrg(app: App, kind: OrgKind, cur: Record<string, unknown> | null): void {
  const o = S.org!;
  const f: Record<string, unknown> = cur ? { ...cur } : { active: true, level: "고", subjects: [] };
  const title = { center: "센터", school: "학교", staff: "강사" }[kind] + (cur ? " 편집" : " 추가");
  const inp = (k: string, label: string, type = "text") => html`<label class="fld"><span>${label}</span><input type=${type} .value=${String(f[k] ?? "")}
    @input=${(e: Event) => { f[k] = (e.target as HTMLInputElement).value; }}></label>`;
  const save = async (close: () => void) => {
    const action = { center: "centerSave", school: "schoolSave", staff: "staffSave" }[kind];
    const body = kind === "staff" ? { ...f, subjects: String(Array.isArray(f.subjects) ? f.subjects.join(",") : f.subjects ?? "").split(/[,·\s]+/).filter(Boolean) } : f;
    try { await api(action, body); toast("저장했습니다.", "ok"); close(); await loadOrg(app); if (kind === "center") await app.reloadMe(); } catch (e) { toast(errMsg(e), "bad"); }
  };
  openDialog(title, (close) => html`<div class="db"><div class="form">
      ${inp("name", "이름")}
      ${kind === "school" ? html`<label class="fld"><span>학교급</span><select @change=${(e: Event) => { f.level = (e.target as HTMLSelectElement).value; }}>
          ${["초", "중", "고"].map((l) => html`<option ?selected=${f.level === l}>${l}</option>`)}</select></label>
        <label class="fld"><span>센터</span><select @change=${(e: Event) => { f.center_id = (e.target as HTMLSelectElement).value || null; }}>
          <option value="">(없음)</option>${o.centers.map((c) => html`<option value=${String(c.id)} ?selected=${f.center_id === c.id}>${c.name}</option>`)}</select></label>` : nothing}
      ${kind === "staff" ? html`${inp("email", "연결할 계정 이메일(선택)")}${inp("phone", "연락처")}
        <label class="fld"><span>과목(쉼표로 구분)</span><input .value=${Array.isArray(f.subjects) ? f.subjects.join(", ") : String(f.subjects ?? "")} @input=${(e: Event) => { f.subjects = (e.target as HTMLInputElement).value; }}></label>
        <label class="fld full"><span>메모</span><textarea .value=${String(f.memo ?? "")} @input=${(e: Event) => { f.memo = (e.target as HTMLTextAreaElement).value; }}></textarea></label>` : nothing}
      ${kind !== "staff" ? inp("sort", "순서", "number") : nothing}
      <label class="fld"><span>사용</span><span style="display:flex;gap:6px;align-items:center;height:34px"><input type="checkbox" style="height:auto" .checked=${f.active !== false}
        @change=${(e: Event) => { f.active = (e.target as HTMLInputElement).checked; }}>사용 중</span></label>
    </div></div>
    <div class="df"><button class="btn" @click=${close}>취소</button><button class="btn pri" @click=${() => save(close)}>저장</button></div>`);
}

// 변경 기록 ---------------------------------------------------------------
function logsMain(app: App): TemplateResult {
  const l = S.logs;
  const cols: Col<Log>[] = [
    { key: "at", label: "시각", value: (r) => r.at, cell: (r) => ymdhm(r.at) },
    { key: "who", label: "누가", value: (r) => r.name || r.email, cell: (r) => html`${r.name || r.email}<div class="note">${r.name ? r.email : ""}</div>` },
    { key: "action", label: "무엇을", value: (r) => r.action, cell: (r) => html`<b>${r.action}</b>` },
    { key: "detail", label: "내용", value: (r) => JSON.stringify(r.detail), cell: (r) => html`<span class="note" style="white-space:pre-wrap;word-break:break-all">${Object.entries(r.detail).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join("\n")}</span>` },
  ];
  return html`${head({ crumb: "관리", title: "변경 기록" })}<div class="content">
    <div class="bar">
      <input class="sel" style="width:240px" placeholder="이름·이메일·내용 검색" .value=${S.q} @change=${(e: Event) => { S.q = (e.target as HTMLInputElement).value; void loadLogs(app); }}>
      <select class="sel" style="width:160px" aria-label="종류" @change=${(e: Event) => { S.act = (e.target as HTMLSelectElement).value; void loadLogs(app); }}>
        <option value="">전체 종류</option>${(l?.actions ?? []).map((a) => html`<option ?selected=${a === S.act}>${a}</option>`)}</select>
      <span class="note">최근 500건</span></div>
    <div class="card" style="overflow:auto">${l ? table(l.rows, cols, S.tL, { redraw: app.redraw }) : html`<div class="loading">불러오는 중…</div>`}</div></div>`;
}
