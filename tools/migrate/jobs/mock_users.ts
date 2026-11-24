// 모의고사 사이트 승인 계정 → W-HUB 계정 + 성적·모의고사 권한
// 원본: School Record 프로젝트 mock.users (읽기만)
// 관리자 → 'admin', 사용자 → 'editor'. 원장 계정(설정 owner_emails)은 건너뛴다(로그인하면 원장으로 들어옴).
// 이미 있는 계정·권한은 바꾸지 않는다(원장님이 W-HUB 에서 고친 것을 덮지 않음).
import type { Job } from "../lib.ts";

const OWNERS = `select lower(e) from core.settings, jsonb_array_elements_text(
  case jsonb_typeof(value) when 'array' then value else '[]'::jsonb end) e where key = 'owner_emails'`;

const job: Job = {
  id: "mock_users",
  source: "School Record · mock.users",
  target: "core.users · core.memberships(weiz/scores_mock)",
  extract: `
with s as (select lower(email) as email, name, role from mock.users where status = 'approved')
select jsonb_build_object(
  'rows', coalesce(jsonb_agg(jsonb_build_object('email', email, 'name', name,
            'role', case when role = 'admin' then 'admin' else 'editor' end) order by email), '[]'::jsonb),
  'check', jsonb_build_object('rows', count(*), 'admins', count(*) filter (where role = 'admin'))) as data
from s`,
  load: `
create temp table _r on commit drop as
  select x->>'email' as email, x->>'name' as name, x->>'role' as role
  from _in, jsonb_array_elements(d->'rows') x
  where x->>'email' not in (${OWNERS});
insert into core.users (email, name, status) select email, name, 'approved' from _r on conflict (email) do nothing;
insert into core.memberships (email, workspace_id, area, role, center_ids)
  select email, 'weiz', 'scores_mock', role, null from _r on conflict do nothing;`,
  checkTarget: `
with x as (select r->>'email' as email, r->>'role' as role from _in, jsonb_array_elements(d->'rows') r),
ok as (select * from x where email in (${OWNERS})
       or exists (select 1 from core.memberships m where m.email = x.email and m.workspace_id = 'weiz' and m.area = 'scores_mock'))
select jsonb_build_object('rows', (select count(*) from ok), 'admins', (select count(*) from ok where role = 'admin'))`,
};
export default job;
