-- W-HUB 0005: 주말반 평가(3단계 2차 A) — 회차 칸 × 학생 기록, 과정별 평가 규칙
-- 입력 단위 = 시간표 상세의 칸 하나(회차 × 반 → 과목·담당 강사). 권한은 '성적·주말반'(scores_weekly).
-- 모의고사 점수는 4단계(성적 › 모의고사)에서 가져온다. 그 전까지는 여기 mock 칸에 임시로 넣는다.

alter table class.sessions add column if not exists mock boolean not null default false;
alter table class.session_cells add column if not exists mock_max numeric(6,1) check (mock_max is null or mock_max > 0);

create table if not exists class.records (
  session_id bigint not null,
  class_id   bigint not null,
  student_id uuid not null references people.students(id) on delete cascade,
  att        text check (att in ('출석','지각','결석')),
  book       boolean,
  beh        int check (beh between 0 and 50),
  nt         int check (nt between 0 and 50),
  hw         text check (hw in ('A','B','C','D')),
  act        int check (act between 0 and 50),
  test       numeric(5,1) check (test between 0 and 100),
  mock       numeric(6,1) check (mock >= 0),
  ver        int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text not null default '',
  primary key (session_id, class_id, student_id),
  foreign key (session_id, class_id) references class.session_cells(session_id, class_id) on delete cascade
);
create index if not exists records_student_idx on class.records(student_id);
comment on column class.records.book is '교재 미지참이면 true';
comment on column class.records.nt is '노트 미흡 횟수(수학 오답노트·과학 이론노트)';

-- 과정별 평가 규칙(참고사이트 기본값). 원장님·관리자가 설정에서 바꾼다.
create table if not exists class.rules (
  course_id    bigint primary key references class.courses(id) on delete cascade,
  weights      jsonb not null default '{"att":5,"book":5,"beh":5,"act":5,"hw":10,"test":20,"mock":50}'::jsonb,
  hw_scale     jsonb not null default '{"A":100,"B":60,"C":20,"D":0}'::jsonb,
  note_penalty numeric(4,1) not null default 2,
  alert        jsonb not null default '{"drop":15,"gap":20,"rep":2,"days":7}'::jsonb,
  updated_at   timestamptz not null default now(),
  updated_by   text not null default ''
);

do $$
declare t text;
begin
  foreach t in array array['records','rules'] loop
    execute format('alter table class.%I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname = 'class' and tablename = t and policyname = 'whub_app_all') then
      execute format('create policy whub_app_all on class.%I for all to whub_app using (true) with check (true)', t);
    end if;
  end loop;
end $$;
grant select, insert, update, delete on class.records, class.rules to whub_app;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on class.records, class.rules from anon, authenticated';
  end if;
end $$;

-- '성적·주말반' 권한 영역을 수업 메뉴에서 쓴다(화면은 수업 메뉴 안).
update core.workspace_areas set ready = true where workspace_id = 'weiz' and area = 'scores_weekly';
