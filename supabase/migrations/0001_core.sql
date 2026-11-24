-- W-HUB 새 Supabase 프로젝트 0001: 계정·권한·운영(core)
-- 이 프로젝트는 W-HUB 전용이다. 기존 프로젝트(School Record·2027SCI·YSIE)는 읽기만 하고 여기에 쓰지 않는다.
-- 브라우저는 표에 직접 접근하지 않는다. 서버 함수 api 가 트랜잭션마다 whub_app 으로 권한을 낮춘다.

create schema if not exists core;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'whub_app') then
    create role whub_app nologin noinherit;
  end if;
end $$;

create table if not exists core.workspaces (
  id    text primary key check (id ~ '^[a-z][a-z0-9_]{1,19}$'),
  name  text not null,
  sort  int  not null default 0
);

-- 작업공간마다 켜는 영역(메뉴). ready=false 면 메뉴에 나오지 않는다.
create table if not exists core.workspace_areas (
  workspace_id text not null references core.workspaces(id) on update cascade,
  area         text not null check (area ~ '^[a-z][a-z0-9_]{1,29}$'),
  name         text not null,
  sort         int  not null default 0,
  ready        boolean not null default false,
  uses_centers boolean not null default false,
  primary key (workspace_id, area)
);

create table if not exists core.users (
  email      text primary key check (email = lower(email) and email like '%@%'),
  name       text not null default '',
  is_owner   boolean not null default false,
  status     text not null default 'pending' check (status in ('approved','pending','blocked')),
  created_at timestamptz not null default now(),
  last_login timestamptz
);

-- 권한: 계정 × 작업공간 × 영역 → 단계 + 센터 범위(null = 전체)
create table if not exists core.memberships (
  email        text not null references core.users(email) on delete cascade on update cascade,
  workspace_id text not null,
  area         text not null,
  role         text not null check (role in ('admin','editor','viewer')),
  center_ids   bigint[],
  updated_at   timestamptz not null default now(),
  primary key (email, workspace_id, area),
  foreign key (workspace_id, area) references core.workspace_areas(workspace_id, area) on delete cascade on update cascade
);

create table if not exists core.sessions (
  token_hash text primary key,
  email      text not null references core.users(email) on delete cascade on update cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen  timestamptz not null default now(),
  user_agent text not null default ''
);
create index if not exists sessions_email_idx on core.sessions(email);

create table if not exists core.audit_log (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  email        text not null default '',
  workspace_id text,
  area         text,
  action       text not null,
  detail       jsonb not null default '{}'::jsonb
);
create index if not exists audit_log_at_idx on core.audit_log(at desc);

create table if not exists core.login_fails (
  id  bigint generated always as identity primary key,
  ip  text not null,
  at  timestamptz not null default now()
);
create index if not exists login_fails_ip_idx on core.login_fails(ip, at desc);

create table if not exists core.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- 긴 작업(AI·대량 처리). 창을 닫아도 서버에서 계속된다.
create table if not exists core.jobs (
  id           uuid primary key default gen_random_uuid(),
  workspace_id text not null references core.workspaces(id),
  area         text not null,
  kind         text not null,
  target       jsonb not null default '{}'::jsonb,
  status       text not null default 'queued' check (status in ('queued','running','done','failed','stopped')),
  step         int not null default 0,
  steps        int not null default 1,
  message      text not null default '',
  result       jsonb,
  error        text,
  created_by   text not null default '',
  created_at   timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz,
  heartbeat_at timestamptz
);
create index if not exists jobs_ws_idx on core.jobs(workspace_id, created_at desc);

-- 함께 보는 중
create table if not exists core.presence (
  session_hash text primary key,
  email        text not null,
  scope        text not null default '',
  last_seen    timestamptz not null default now()
);

-- 옮겨 오기(기존 DB 복사) 실행 기록
create table if not exists core.migration_runs (
  id          bigint generated always as identity primary key,
  source      text not null,
  target      text not null,
  rows_in     int not null default 0,
  rows_out    int not null default 0,
  source_hash text not null default '',
  result      text not null default '' check (result in ('', 'ok', 'mismatch', 'failed')),
  detail      jsonb not null default '{}'::jsonb,
  run_by      text not null default '',
  run_at      timestamptz not null default now()
);

-- 권한 ---------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['workspaces','workspace_areas','users','memberships','sessions','audit_log','login_fails','settings','jobs','presence','migration_runs'] loop
    execute format('alter table core.%I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname = 'core' and tablename = t and policyname = 'whub_app_all') then
      execute format('create policy whub_app_all on core.%I for all to whub_app using (true) with check (true)', t);
    end if;
  end loop;
end $$;
grant usage on schema core to whub_app;
grant select, insert, update, delete on all tables in schema core to whub_app;
grant usage, select on all sequences in schema core to whub_app;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema core from anon, authenticated';
    execute 'revoke all on all tables in schema core from anon, authenticated';
  end if;
end $$;
grant whub_app to postgres;

-- 기본 데이터 ----------------------------------------------------------
insert into core.workspaces (id, name, sort) values ('weiz', '와이즈만', 1), ('yonsei', '연세국제', 2)
on conflict (id) do nothing;

insert into core.workspace_areas (workspace_id, area, name, sort, ready, uses_centers) values
  ('weiz',   'students',      '학생',      1, true,  true),
  ('weiz',   'scores_mock',   '성적·모의고사', 2, false, false),
  ('weiz',   'scores_naesin', '성적·내신',    3, false, true),
  ('weiz',   'scores_weekly', '성적·주말반',  4, false, false),
  ('weiz',   'class',         '수업',      5, false, false),
  ('weiz',   'admission',     '입시',      6, false, true),
  ('weiz',   'analysis',      '분석',      7, false, true),
  ('weiz',   'calendar',      '일정',      8, false, false),
  ('yonsei', 'students',      '학생',      1, true,  true),
  ('yonsei', 'scores_diag',   '성적·온라인 진단', 2, false, false),
  ('yonsei', 'scores_naesin', '성적·내신',    3, false, true),
  ('yonsei', 'admission',     '입시',      4, false, true),
  ('yonsei', 'analysis',      '분석',      5, false, true),
  ('yonsei', 'bank',          '문제은행',    6, false, false),
  ('yonsei', 'calendar',      '일정',      7, false, false)
on conflict (workspace_id, area) do nothing;

insert into core.settings (key, value) values ('session_days', '14'::jsonb)
on conflict (key) do nothing;
