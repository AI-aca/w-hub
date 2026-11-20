export type Role = "owner" | "admin" | "editor" | "viewer";
export const ROLE_LABEL: Record<Role, string> = { owner: "원장", admin: "관리자", editor: "입력자", viewer: "열람" };

export interface User { email: string; name: string; is_owner: boolean }
export interface Workspace { id: string; name: string; sort: number }
export interface ModuleInfo { workspace_id: string; module_key: string; name: string; sort: number; ready: boolean; uses_centers: boolean }
export interface Center { id: number; workspace_id: string; name: string; sort: number; active?: boolean }
export interface Access { role: Role; center_ids: number[] | null }
export type AccessMap = Record<string, Record<string, Access>>;

export interface MeResponse {
  ok: true;
  user: User;
  access: AccessMap;
  workspaces: Workspace[];
  modules: ModuleInfo[];
  centers: Center[];
}

export interface Membership { workspace_id: string; module_key: string; role: Exclude<Role, "owner">; center_ids: number[] | null }
export interface AdminUser {
  email: string; name: string; is_owner: boolean; status: "approved" | "pending" | "blocked";
  created_at: string; last_login: string | null; last_seen: string | null; memberships: Membership[];
}
