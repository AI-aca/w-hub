-- W-HUB 0002: 센터·학교·강사(org) — 모든 영역이 같이 쓰는 명부

create schema if not exists org;

create table if not exists org.centers (
  id           bigint generated always as identity primary key,
  workspace_id text not null references core.workspaces(id) on update cascade,
  name         text not null check (length(name) between 1 and 40),
  sort         int  not null default 0,
  active       boolean not null default true,
  unique (workspace_id, name)
);

create table if not exists org.schools (
  id           bigint generated always as identity primary key,
  workspace_id text not null references core.workspaces(id) on update cascade,
  center_id    bigint references org.centers(id) on delete set null,
  name         text not null check (length(name) between 1 and 40),
  level        text not null check (level in ('초','중','고')),
  active       boolean not null default true,
  sort         int  not null default 0,
  unique (workspace_id, center_id, name)
);

-- 강사·직원: 주말반 담당, 내신 담당자, 자소서 지도 교사를 한 명부로. 계정(email)과 이어지면 '내 반·과목'이 먼저 열린다.
create table if not exists org.staff (
  id           uuid primary key default gen_random_uuid(),
  workspace_id text not null references core.workspaces(id) on update cascade,
  name         text not null check (length(name) between 1 and 40),
  email        text references core.users(email) on delete set null on update cascade,
  phone        text not null default '',
  subjects     text[] not null default '{}',
  memo         text not null default '',
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists staff_ws_name_idx on org.staff(workspace_id, name) where active;

do $$
declare t text;
begin
  foreach t in array array['centers','schools','staff'] loop
    execute format('alter table org.%I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname = 'org' and tablename = t and policyname = 'whub_app_all') then
      execute format('create policy whub_app_all on org.%I for all to whub_app using (true) with check (true)', t);
    end if;
  end loop;
end $$;
grant usage on schema org to whub_app;
grant select, insert, update, delete on all tables in schema org to whub_app;
grant usage, select on all sequences in schema org to whub_app;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema org from anon, authenticated';
    execute 'revoke all on all tables in schema org from anon, authenticated';
  end if;
end $$;

-- 센터 기본값(내신 사이트의 센터 6곳 기준). 이름은 관리 화면에서 바꿀 수 있다.
insert into org.centers (workspace_id, name, sort) values
  ('weiz', '청라', 1), ('weiz', '송도', 2), ('weiz', '한강(김포)', 3), ('weiz', '산본', 4), ('weiz', '배곧(시흥)', 5),
  ('yonsei', '세종', 1)
on conflict (workspace_id, name) do nothing;
