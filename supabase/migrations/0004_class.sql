-- W-HUB 0004: 수업(주말반) 운영 + 일정
-- 과정(2028 영재학교반) → 학기([1차]·[2차]) → 시간표(요약 = 요일 틀, 상세 = 날짜별 회차) · 진도(주차 × 과목 × 반) · 업무 일정
-- 반·과목·강사는 이름 문자열이 아니라 id 로 잇는다(이름을 바꿔도 깨지지 않음). 칸 색칠은 '중요' 표시 하나로 대신한다.

create schema if not exists class;
create schema if not exists calendar;

create table if not exists class.courses (
  id           bigint generated always as identity primary key,
  workspace_id text not null references core.workspaces(id) on update cascade,
  name         text not null check (length(name) between 1 and 60),
  sort         int  not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (workspace_id, name)
);

create table if not exists class.terms (
  id         bigint generated always as identity primary key,
  course_id  bigint not null references class.courses(id) on delete cascade,
  name       text not null check (length(name) between 1 and 60),
  starts_on  date,
  ends_on    date,
  sort       int not null default 0,
  unique (course_id, name)
);

create table if not exists class.subjects (
  id         bigint generated always as identity primary key,
  course_id  bigint not null references class.courses(id) on delete cascade,
  name       text not null check (length(name) between 1 and 30),
  category   text not null check (category in ('수학','과학','기타')),
  emoji      text not null default '',
  sort       int  not null default 0,
  active     boolean not null default true,
  unique (course_id, name)
);

create table if not exists class.classes (
  id         bigint generated always as identity primary key,
  course_id  bigint not null references class.courses(id) on delete cascade,
  name       text not null check (length(name) between 1 and 30),
  sort       int  not null default 0,
  active     boolean not null default true,
  unique (course_id, name)
);

-- 시간표 요약: 요일·시간대 하나 = slot, 반마다 칸 하나
create table if not exists class.slots (
  id         bigint generated always as identity primary key,
  term_id    bigint not null references class.terms(id) on delete cascade,
  weekday    smallint not null check (weekday between 0 and 6),
  start_t    text not null default '' check (start_t = '' or start_t ~ '^[0-2][0-9]:[0-5][0-9]$'),
  end_t      text not null default '' check (end_t = '' or end_t ~ '^[0-2][0-9]:[0-5][0-9]$'),
  sort       int  not null default 0,
  ver        int  not null default 1
);
create table if not exists class.slot_cells (
  slot_id    bigint not null references class.slots(id) on delete cascade,
  class_id   bigint not null references class.classes(id) on delete cascade,
  subject_id bigint references class.subjects(id) on delete set null,
  staff_id   uuid references org.staff(id) on delete set null,
  note       text not null default '',
  primary key (slot_id, class_id)
);

-- 시간표 상세: 날짜·시간대 하나 = 회차(session). 휴강은 kind = 'holiday'
create table if not exists class.sessions (
  id         bigint generated always as identity primary key,
  term_id    bigint not null references class.terms(id) on delete cascade,
  on_date    date not null,
  start_t    text not null default '' check (start_t = '' or start_t ~ '^[0-2][0-9]:[0-5][0-9]$'),
  end_t      text not null default '' check (end_t = '' or end_t ~ '^[0-2][0-9]:[0-5][0-9]$'),
  kind       text not null default 'class' check (kind in ('class','holiday')),
  week_label text not null default '',
  note       text not null default '',
  important  boolean not null default false,
  ver        int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);
create index if not exists sessions_term_idx on class.sessions(term_id, on_date, start_t);
create table if not exists class.session_cells (
  session_id bigint not null references class.sessions(id) on delete cascade,
  class_id   bigint not null references class.classes(id) on delete cascade,
  subject_id bigint references class.subjects(id) on delete set null,
  staff_id   uuid references org.staff(id) on delete set null,
  note       text not null default '',
  primary key (session_id, class_id)
);

-- 진도: 학기 × 수학/과학 × 주차 × 과목 × 반 → 내용
create table if not exists class.weeks (
  id        bigint generated always as identity primary key,
  term_id   bigint not null references class.terms(id) on delete cascade,
  category  text not null check (category in ('수학','과학')),
  no        int  not null check (no between 0 and 200),
  label     text not null default '',
  unique (term_id, category, no)
);
create table if not exists class.curriculum (
  week_id    bigint not null references class.weeks(id) on delete cascade,
  subject_id bigint not null references class.subjects(id) on delete cascade,
  class_id   bigint not null references class.classes(id) on delete cascade,
  content    text not null default '',
  important  boolean not null default false,
  ver        int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text not null default '',
  primary key (week_id, subject_id, class_id)
);

-- 수강생: 과정 × 학생 → 반, 반편성 점수
create table if not exists class.enrollments (
  course_id  bigint not null references class.courses(id) on delete cascade,
  student_id uuid not null references people.students(id) on delete cascade,
  class_id   bigint references class.classes(id) on delete set null,
  scores     jsonb not null default '{}'::jsonb,
  note       text not null default '',
  status     text not null default 'active' check (status in ('active','left')),
  ver        int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text not null default '',
  primary key (course_id, student_id)
);

-- 일정(업무 일정·행사). 수업 영역에서 쓰는 것은 course_id/term_id 가 있다.
create table if not exists calendar.events (
  id           bigint generated always as identity primary key,
  workspace_id text not null references core.workspaces(id) on update cascade,
  course_id    bigint references class.courses(id) on delete cascade,
  term_id      bigint references class.terms(id) on delete cascade,
  on_date      date not null,
  title        text not null default '',
  status       text not null default 'todo' check (status in ('todo','done')),
  note         text not null default '',
  important    boolean not null default false,
  ver          int not null default 1,
  created_by   text not null default '',
  updated_at   timestamptz not null default now(),
  updated_by   text not null default ''
);
create index if not exists events_ws_idx on calendar.events(workspace_id, on_date);

-- 권한 ---------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['courses','terms','subjects','classes','slots','slot_cells','sessions','session_cells','weeks','curriculum','enrollments'] loop
    execute format('alter table class.%I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname = 'class' and tablename = t and policyname = 'whub_app_all') then
      execute format('create policy whub_app_all on class.%I for all to whub_app using (true) with check (true)', t);
    end if;
  end loop;
  foreach t in array array['events'] loop
    execute format('alter table calendar.%I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname = 'calendar' and tablename = t and policyname = 'whub_app_all') then
      execute format('create policy whub_app_all on calendar.%I for all to whub_app using (true) with check (true)', t);
    end if;
  end loop;
end $$;
grant usage on schema class, calendar to whub_app;
grant select, insert, update, delete on all tables in schema class to whub_app;
grant select, insert, update, delete on all tables in schema calendar to whub_app;
grant usage, select on all sequences in schema class to whub_app;
grant usage, select on all sequences in schema calendar to whub_app;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema class, calendar from anon, authenticated';
    execute 'revoke all on all tables in schema class from anon, authenticated';
    execute 'revoke all on all tables in schema calendar from anon, authenticated';
  end if;
end $$;

-- 수업 영역 열기(와이즈만). 메뉴는 권한이 있는 사람에게만 보인다.
update core.workspace_areas set ready = true where workspace_id = 'weiz' and area = 'class';
