// 홈: 내가 쓸 수 있는 업무와 할 일. 실제 숫자만 보여 준다(가짜 숫자 없음).
import { html, nothing } from "lit-html";
import { api } from "../../shared/core/api";
import { MENUS } from "../../shared/core/menu";
import { href } from "../../shared/core/route";
import { ROLE_KO } from "../../shared/core/types";
import type { App, View } from "../../shell/app";
import { centersOf } from "../../shell/app";
import { head } from "../../shell/layout";

interface Counts { ws: string; students?: number; pending?: number }
let counts: Counts | null = null;
let loading = "";

function load(app: App): void {
  if (loading === app.ws || counts?.ws === app.ws) return;
  loading = app.ws;
  const c: Counts = { ws: app.ws };
  const jobs: Promise<unknown>[] = [];
  if (app.me.access[app.ws]?.students) {
    jobs.push(api<{ rows: unknown[] }>("studentList").then((r) => { c.students = r.rows.length; }).catch(() => {}));
  }
  if (app.me.user.is_owner) {
    jobs.push(api<{ users: { status: string }[] }>("userList").then((r) => { c.pending = r.users.filter((u) => u.status === "pending").length; }).catch(() => {}));
  }
  Promise.all(jobs).then(() => { counts = c; loading = ""; app.redraw(); });
}
export const resetHome = () => { counts = null; };

export function homeView(app: App): View {
  load(app);
  const c = counts?.ws === app.ws ? counts : null;
  const ws = app.me.workspaces.find((w) => w.id === app.ws);
  const acc = app.me.access[app.ws] ?? {};
  const areas = app.me.areas.filter((a) => a.workspace_id === app.ws);
  const cname = (ids: number[] | null) => ids ? ids.map((id) => centersOf(app).find((x) => x.id === id)?.name ?? id).join("·") : "전체 센터";
  const menuOf = (area: string) => MENUS.find((m) => m.areas.includes(area));
  return {
    main: html`${head({ crumb: ws?.name, title: `${app.me.user.name || "선생님"}님, 안녕하세요` })}
    <div class="content">
      <div class="kpis">
        ${c?.students != null ? html`<a class="kpi" href=${href(app.ws, "students")} style="text-decoration:none;color:inherit"><div class="k">학생</div><div class="v num">${c.students}명</div><div class="s">${cname(acc.students?.center_ids ?? null)}</div></a>` : nothing}
        ${c?.pending != null ? html`<a class="kpi" href=${href(app.ws, "admin", "users")} style="text-decoration:none;color:inherit"><div class="k">승인 대기 계정</div><div class="v num" style=${c.pending ? "color:var(--bad)" : ""}>${c.pending}개</div><div class="s">눌러서 승인</div></a>` : nothing}
        ${!c ? html`<div class="kpi"><div class="k">불러오는 중…</div><div class="v">&nbsp;</div></div>` : nothing}
      </div>
      <div class="card">
        <div class="ch"><h3>내 업무</h3><span class="note">권한이 있는 영역입니다. 아직 옮기는 중인 영역은 지금 쓰시는 기존 사이트를 계속 쓰시면 됩니다.</span></div>
        <div class="cb" style="padding:0">
          <table class="t"><thead><tr><th>메뉴</th><th>영역</th><th>권한</th><th>범위</th><th>상태</th></tr></thead><tbody>
          ${areas.filter((a) => acc[a.area]).map((a) => html`<tr>
            <td>${menuOf(a.area)?.name ?? ""}</td>
            <td>${a.ready ? html`<a href=${href(app.ws, menuOf(a.area)?.key ?? "home")}><b>${a.name}</b></a>` : a.name}</td>
            <td>${ROLE_KO[acc[a.area].role]}</td>
            <td>${a.uses_centers ? cname(acc[a.area].center_ids) : "—"}</td>
            <td>${a.ready ? html`<span class="chip ok">사용 가능</span>` : html`<span class="chip">옮기는 중</span>`}</td></tr>`)}
          </tbody></table>
        </div>
      </div>
    </div>`,
  };
}
