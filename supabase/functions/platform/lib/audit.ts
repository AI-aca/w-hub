import type { Tx } from "./db.ts";

export async function log(
  tx: Tx, email: string, action: string, detail: Record<string, unknown>, workspace?: string, module?: string,
): Promise<void> {
  await tx`insert into core.audit_log (email, workspace_id, module_key, action, detail)
           values (${email}, ${workspace ?? null}, ${module ?? null}, ${action}, ${tx.json(detail as never)})`;
}
