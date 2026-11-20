// 작업공간 홈: 내가 쓸 수 있는 모듈 요약
import { html } from "lit-html";
import { metaOf } from "../../core/modules";
import { ROLE_LABEL, type MeResponse } from "../../core/types";
import { href } from "../router";
import { state } from "../state";

export function centersLabel(me: MeResponse, ids: number[] | null): string {
  if (!ids) return "전체 센터";
  const names = ids.map((id) => me.centers.find((c) => c.id === id)?.name).filter(Boolean);
  return names.length ? names.join(" · ") : "-";
}

export function homeView(me: MeResponse, ws: string) {
  const wsName = me.workspaces.find((w) => w.id === ws)?.name ?? "";
  const mods = me.modules.filter((m) => m.workspace_id === ws);
  return html`<section class="page">
    <header class="page-head">
      <div>
        <p class="eyebrow">${wsName}</p>
        <h1>${me.user.name || me.user.email}님, 안녕하세요</h1>
      </div>
    </header>

    ${me.user.is_owner && state.pendingCount > 0 ? html`<a class="notice" href=${href.admin("users")}>
        승인 대기 계정 <b>${state.pendingCount}</b>개가 있습니다. 계정 관리에서 확인하세요 →</a>` : ""}

    ${mods.length === 0 ? html`<div class="empty">이 작업공간에서 사용할 수 있는 모듈이 없습니다.</div>` : html`
    <div class="cards">
      ${mods.map((m) => {
        const meta = metaOf(m.module_key);
        const acc = me.access[ws]?.[m.module_key];
        return html`<article class="card" style=${`--accent:${meta.accent}`}>
          <a class="card-main" href=${href.module(ws, m.module_key)}>
            <div class="card-top"><span class="dot"></span><h2>${m.name}</h2>
              ${m.ready ? html`<span class="pill ok">사용 중</span>` : html`<span class="pill">준비 중 · ${meta.stage}</span>`}</div>
            <p class="desc">${meta.desc}</p>
            <dl class="kv">
              <dt>내 권한</dt><dd>${acc ? ROLE_LABEL[acc.role] : "-"}</dd>
              ${m.uses_centers ? html`<dt>센터</dt><dd>${centersLabel(me, acc?.center_ids ?? null)}</dd>` : ""}
            </dl>
          </a>
          ${!m.ready && meta.legacy ? html`<a class="card-foot" href=${meta.legacy.url} target="_blank" rel="noopener">
              지금은 ${meta.legacy.label}에서 작업 ↗</a>` : ""}
        </article>`;
      })}
    </div>`}
  </section>`;
}
