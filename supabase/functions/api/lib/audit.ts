import type { Tx } from "./db.ts";

/** 변경 기록. 누가·언제·어느 작업공간/영역에서·무엇을 */
export async function log(
  tx: Tx, email: string, action: string, detail: Record<string, unknown>, workspace?: string | null, area?: string | null,
): Promise<void> {
  await tx`insert into core.audit_log (email, workspace_id, area, action, detail)
           values (${email}, ${workspace ?? null}, ${area ?? null}, ${action}, ${tx.json(detail as never)})`;
}
