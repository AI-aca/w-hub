-- w-hub 0001: 뼈대(core) — 로그인·작업공간·권한·센터·감사 로그
-- School Record 프로젝트에 새로 추가하는 core 스키마. 기존 스키마(public·mock·naesin·weiz2028)는 건드리지 않는다.
-- 표는 Data API로 노출하지 않는다. 브라우저는 Edge Function platform 만 거친다.
-- 함수는 트랜잭션 시작 즉시 "set local role core_app" 으로 권한을 낮춘다.

create schema if not exists core;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'core_app') then
    create role core_app nologin noinherit;
  end if;
end $$;

-- 작업공간(사업부): 와이즈만 / 연세국제
create table if not exists core.workspaces (
  id    text primary key check (id ~ '^[a-z][a-z0-9_]{1,19}$'),
  name  text not null,
  sort  int  not null default 0
);

-- 작업공간마다 켤 수 있는 모듈. 같은 모듈 코드(naesin)가 두 작업공간에 각각 들어갈 수 있다.
create table if not exists core.workspace_modules (
  workspace_id text not null references core.workspaces(id) on update cascade,
  module_key   text not null check (module_key ~ '^[a-z][a-z0-9_]{1,29}$'),
  name         text not null,
  sort         int  not null default 0,
  ready        boolean not null default false,          -- 화면 이식 완료 여부(홈·메뉴 표시용)
  uses_centers boolean not null default false,          -- 센터 범위를 적용하는 모듈인가
  primary key (workspace_id, module_key)
);

create table if not exists core.centers (
  id           bigint generated always as identity primary key,
  workspace_id text not null references core.workspaces(id) on update cascade,
  name         text not null check (length(name) between 1 and 40),
  sort         int  not null default 0,
  active       boolean not null default true,
  unique (workspace_id, name)
);

-- 사용자: 구글 계정. is_owner = 원장(두 작업공간 전체 + 계정 관리)
create table if not exists core.users (
  email      text primary key check (email = lower(email) and email like '%@%'),
  name       text not null default '',
  is_owner   boolean not null default false,
  status     text not null default 'pending' check (status in ('approved','pending','blocked')),
  created_at timestamptz not null default now(),
  last_login timestamptz
);

-- 권한: 계정 × 작업공간 × 모듈 → 단계 + 센터 범위(null = 전체)
create table if not exists core.memberships (
  email        text not null references core.users(email) on delete cascade on update cascade,
  workspace_id text not null,
  module_key   text not null,
  role         text not null check (role in ('admin','editor','viewer')),  -- 관리자 / 입력자 / 열람
  center_ids   bigint[],
  updated_at   timestamptz not null default now(),
  primary key (email, workspace_id, module_key),
  foreign key (workspace_id, module_key) references core.workspace_modules(workspace_id, module_key) on delete cascade on update cascade
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
  module_key   text,
  action       text not null,
  detail       jsonb not null default '{}'::jsonb
);
create index if not exists audit_log_at_idx on core.audit_log(at desc);

-- 구글 로그인 실패 기록(같은 IP 10분 20회 넘으면 잠시 차단)
create table if not exists core.login_fails (
  id  bigint generated always as identity primary key,
  ip  text not null,
  at  timestamptz not null default now()
);
create index if not exists login_fails_ip_idx on core.login_fails(ip, at desc);

-- 사이트 설정(허용 출처·원장 이메일·구글 클라이언트 ID). 비밀 키는 두지 않는다.
create table if not exists core.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- 권한: core_app 만 core 를 쓴다. anon·authenticated 는 접근 불가.
grant usage on schema core to core_app;
grant select, insert, update, delete on all tables in schema core to core_app;
grant usage, select on all sequences in schema core to core_app;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema core from anon, authenticated';
    execute 'revoke all on all tables in schema core from anon, authenticated';
  end if;
end $$;
-- 함수가 접속하는 역할(postgres)이 core_app 으로 전환할 수 있어야 한다
grant core_app to postgres;

alter table core.workspaces        enable row level security;
alter table core.workspace_modules enable row level security;
alter table core.centers           enable row level security;
alter table core.users             enable row level security;
alter table core.memberships       enable row level security;
alter table core.sessions          enable row level security;
alter table core.audit_log         enable row level security;
alter table core.login_fails       enable row level security;
alter table core.settings          enable row level security;
-- core_app 은 RLS 정책으로 전체 허용(접근 통제는 함수가 한다)
do $$
declare t text;
begin
  foreach t in array array['workspaces','workspace_modules','centers','users','memberships','sessions','audit_log','login_fails','settings'] loop
    if not exists (select 1 from pg_policies where schemaname = 'core' and tablename = t and policyname = 'core_app_all') then
      execute format('create policy core_app_all on core.%I for all to core_app using (true) with check (true)', t);
    end if;
  end loop;
end $$;

-- 기본 데이터 --------------------------------------------------------------
insert into core.workspaces (id, name, sort) values
  ('weiz',   '와이즈만', 1),
  ('yonsei', '연세국제', 2)
on conflict (id) do nothing;

insert into core.workspace_modules (workspace_id, module_key, name, sort, uses_centers) values
  ('weiz',   'weekend', '주말반',         1, false),
  ('weiz',   'mock',    '모의고사',       2, false),
  ('weiz',   'naesin',  '내신',           3, true),
  ('weiz',   'record',  '생기부 진단',    4, true),
  ('yonsei', 'ydiag',   '온라인 진단',    1, false),
  ('yonsei', 'flhs',    '외고·국제고',    2, false),
  ('yonsei', 'naesin',  '내신',           3, true)
on conflict (workspace_id, module_key) do nothing;

-- 센터: 원장님 확인 전 기본값. 관리 화면에서 고칠 수 있다.
insert into core.centers (workspace_id, name, sort) values
  ('weiz', '청라', 1), ('weiz', '송도', 2), ('weiz', '한강(김포)', 3),
  ('weiz', '산본', 4), ('weiz', '배곧(시흥)', 5),
  ('yonsei', '세종(연세국제영어)', 1)
on conflict (workspace_id, name) do nothing;

insert into core.settings (key, value) values
  ('session_days', '14'::jsonb)
on conflict (key) do nothing;

-- 운영 설정(값은 배포 때 원장님 확인 후 넣는다. 공개 저장소에 이메일을 적지 않기 위해 여기서는 비워 둔다)
insert into core.settings (key, value) values
  ('allowed_origins', '["https://ai-aca.github.io"]'::jsonb),
  ('owner_emails', '[]'::jsonb),
  ('google_client_id', '""'::jsonb)
on conflict (key) do nothing;
