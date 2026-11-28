-- W-HUB 0009: 커트라인·1지망·학생 리포트(3단계 2차 C) — 추가만(새 표·새 칸), 지우기 없음. 두 번 실행해도 안전.
-- 참고사이트: cutlines/r{회차}{g0~g3}, hopes/{학생}{hope1,hope2}, reports/{학생}_r{차수}{text}.
-- 학교·커트라인 그룹 목록(서울과학고…)은 참고사이트처럼 코드 상수로 둔다(문서 50 '원장님 결정 필요').

-- 1·2지망: 학생이 이 과정(주말반)에 등록한 줄에 붙인다.
alter table class.enrollments add column if not exists hope1 text not null default '' check (length(hope1) <= 40);
alter table class.enrollments add column if not exists hope2 text not null default '' check (length(hope2) <= 40);

-- 커트라인(합격 안전선, 환산 200점): 학기 × 모의 회차(1부터) × 그룹(0~3). 빈 칸으로 저장하면 value 가 null (그 회차에 줄은 있음 — 원본 동작).
create table if not exists class.cutlines (
  term_id    bigint not null references class.terms(id) on delete cascade,
  round      int  not null check (round between 1 and 99),
  grp        int  not null check (grp between 0 and 3),
  value      numeric(5,1) check (value is null or value between 0 and 200),
  updated_at timestamptz not null default now(),
  updated_by text not null default '',
  primary key (term_id, round, grp)
);

-- 리포트 총평(고친 문안): 학기 × 학생 × 차수. 없으면 자동 문안을 쓴다.
create table if not exists class.reports (
  term_id    bigint not null references class.terms(id) on delete cascade,
  student_id uuid   not null references people.students(id) on delete cascade,
  k          int    not null check (k between 1 and 9),
  body       text   not null check (length(body) <= 3000),
  updated_at timestamptz not null default now(),
  updated_by text not null default '',
  primary key (term_id, student_id, k)
);

do $$
declare t text;
begin
  foreach t in array array['cutlines','reports'] loop
    execute format('alter table class.%I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname = 'class' and tablename = t and policyname = 'whub_app_all') then
      execute format('create policy whub_app_all on class.%I for all to whub_app using (true) with check (true)', t);
    end if;
  end loop;
end $$;
grant select, insert, update, delete on class.cutlines, class.reports to whub_app;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on class.cutlines, class.reports from anon, authenticated';
  end if;
end $$;
