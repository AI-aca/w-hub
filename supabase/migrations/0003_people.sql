-- W-HUB 0003: 학생 명부(people) — 작업공간별. 와이즈만 학생과 연세국제 학생은 섞이지 않는다.

create schema if not exists people;

create table if not exists people.students (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  text not null references core.workspaces(id) on update cascade,
  name          text not null check (length(name) between 1 and 40),
  name_no       int  not null default 0 check (name_no between 0 and 99),
  center_id     bigint references org.centers(id) on delete set null,
  school_name   text not null default '',
  entry_year    int check (entry_year is null or entry_year between 2000 and 2100),
  student_phone text not null default '',
  parent_phone  text not null default '',
  memo          text not null default '',
  status        text not null default 'active' check (status in ('active','archived')),
  ver           int  not null default 1,
  created_at    timestamptz not null default now(),
  created_by    text not null default '',
  updated_at    timestamptz not null default now(),
  updated_by    text not null default ''
);
create unique index if not exists students_identity_idx
  on people.students(workspace_id, name, name_no, coalesce(center_id, 0), school_name) where status = 'active';
create index if not exists students_ws_idx on people.students(workspace_id, status, name);

-- 센터는 같은 작업공간 것만
create or replace function people.check_student_center() returns trigger language plpgsql as $$
begin
  if new.center_id is not null and not exists (
    select 1 from org.centers c where c.id = new.center_id and c.workspace_id = new.workspace_id) then
    raise exception '다른 작업공간의 센터는 지정할 수 없습니다.';
  end if;
  return new;
end $$;
drop trigger if exists students_center_ws on people.students;
create trigger students_center_ws before insert or update on people.students
  for each row execute function people.check_student_center();

-- 옛 DB의 학생 표시(모의 id, 내신 이름+번호, 생기부 uuid …) — 옮겨 오기 재실행·대조용
create table if not exists people.student_aliases (
  id          bigint generated always as identity primary key,
  student_id  uuid not null references people.students(id) on delete cascade,
  source      text not null check (source in ('mock','naesin','record','sci','ysie','weiz2028','yonsei','manual')),
  source_key  text not null,
  created_at  timestamptz not null default now(),
  unique (source, source_key)
);

-- 같은 학생인지 애매한 경우(동명이인·학교 불일치) 확인 대기
create table if not exists people.merge_queue (
  id           bigint generated always as identity primary key,
  workspace_id text not null references core.workspaces(id),
  source       text not null,
  source_key   text not null,
  payload      jsonb not null default '{}'::jsonb,
  candidates   uuid[] not null default '{}',
  reason       text not null default '',
  status       text not null default 'open' check (status in ('open','done','ignored')),
  created_at   timestamptz not null default now(),
  done_by      text not null default '',
  done_at      timestamptz
);

-- 학생용 링크(자소서 작성·온라인 진단 응시). 학생은 구글 로그인 없이 이 링크로만 들어온다. 전환일 이후 사용.
create table if not exists people.student_access (
  id          bigint generated always as identity primary key,
  student_id  uuid not null references people.students(id) on delete cascade,
  purpose     text not null check (purpose in ('essay','diag')),
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  created_by  text not null default '',
  created_at  timestamptz not null default now(),
  last_used   timestamptz
);

do $$
declare t text;
begin
  foreach t in array array['students','student_aliases','merge_queue','student_access'] loop
    execute format('alter table people.%I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname = 'people' and tablename = t and policyname = 'whub_app_all') then
      execute format('create policy whub_app_all on people.%I for all to whub_app using (true) with check (true)', t);
    end if;
  end loop;
end $$;
grant usage on schema people to whub_app;
grant select, insert, update, delete on all tables in schema people to whub_app;
grant usage, select on all sequences in schema people to whub_app;
grant execute on function people.check_student_center() to whub_app;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema people from anon, authenticated';
    execute 'revoke all on all tables in schema people from anon, authenticated';
  end if;
end $$;
