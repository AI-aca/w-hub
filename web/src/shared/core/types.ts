// 서버 응답 형태(서버 areas/core/actions.ts me 와 맞춘다)
export type Role = "owner" | "admin" | "editor" | "viewer";
export interface AreaAccess { role: Role; center_ids: number[] | null }
export interface Workspace { id: string; name: string; sort: number }
export interface AreaDef { workspace_id: string; area: string; name: string; sort: number; ready: boolean; uses_centers: boolean }
export interface Center { id: number; workspace_id: string; name: string; sort: number; active?: boolean }
export interface MeResp {
  user: { email: string; name: string; is_owner: boolean };
  access: Record<string, Record<string, AreaAccess>>;
  workspaces: Workspace[];
  areas: AreaDef[];
  centers: Center[];
}
export const ROLE_KO: Record<Role, string> = { owner: "원장", admin: "관리", editor: "입력", viewer: "열람" };
export const ROLE_RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3, owner: 4 };
