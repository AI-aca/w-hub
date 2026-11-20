// 모듈 화면 자리(각 단계에서 실제 화면으로 바뀐다)
import { html } from "lit-html";
import { metaOf } from "../../core/modules";
import { ROLE_LABEL, type MeResponse } from "../../core/types";
import { centersLabel } from "./home";

export function moduleView(me: MeResponse, ws: string, key: string) {
  const m = me.modules.find((x) => x.workspace_id === ws && x.module_key === key);
  if (!m) return html`<section class="page"><div class="empty">이 모듈을 쓸 권한이 없습니다.</div></section>`;
  const meta = metaOf(key);
  const acc = me.access[ws]?.[key];
  return html`<section class="page" style=${`--accent:${meta.accent}`}>
    <header class="page-head">
      <div><p class="eyebrow">${me.workspaces.find((w) => w.id === ws)?.name}</p><h1>${m.name}</h1></div>
      <div class="chips">
        <span class="chip">권한 · ${acc ? ROLE_LABEL[acc.role] : "-"}</span>
        ${m.uses_centers ? html`<span class="chip">센터 · ${centersLabel(me, acc?.center_ids ?? null)}</span>` : ""}
      </div>
    </header>
    <div class="placeholder">
      <h2>이 화면은 ${meta.stage}에서 옮겨 옵니다</h2>
      <p>${meta.desc}</p>
      ${meta.legacy ? html`<a class="btn primary" href=${meta.legacy.url} target="_blank" rel="noopener">${meta.legacy.label} 열기 ↗</a>
        <p class="hint">옮기기 전까지는 기존 사이트를 그대로 사용합니다. 기존 사이트와 링크는 바뀌지 않습니다.</p>` : ""}
    </div>
  </section>`;
}
