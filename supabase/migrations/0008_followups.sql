-- W-HUB 0008: 집중관리·과목 경보(3단계 2차 B2·B3) — 반 담임, 조치(사후관리) 기록.
-- 참고사이트: 반별 담임 HR, followups/{sid, cls, subj(과목 또는 hr=담임), teacher, date, type, text, alert}.

alter table class.classes add column if not exists homeroom_staff_id uuid references org.staff(id) on delete set null;

create table if not exists class.followups (
  id          bigint generated always as identity primary key,
  course_id   bigint not null references class.courses(id) on delete cascade,
  term_id     bigint not null references class.terms(id) on delete cascade,
  student_id  uuid not null references people.students(id) on delete cascade,
  class_id    bigint references class.classes(id) on delete set null,
  subject_id  bigint references class.subjects(id) on delete set null,   -- 비면 담임 기록
  staff_id    uuid references org.staff(id) on delete set null,          -- 작성 교사
  on_date     date not null,
  kind        text not null check (kind in ('보충수업','학생 상담','학부모 상담','과제 재제출','기타')),
  body        text not null check (length(body) between 1 and 500),
  alert_key   text check (alert_key is null or length(alert_key) <= 120), -- 과목 경보에서 쓴 기록이면 그 경보
  created_by  text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists followups_term_idx on class.followups(term_id, student_id);

do $$
declare t text;
begin
  foreach t in array array['followups'] loop
    execute format('alter table class.%I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname = 'class' and tablename = t and policyname = 'whub_app_all') then
      execute format('create policy whub_app_all on class.%I for all to whub_app using (true) with check (true)', t);
    end if;
  end loop;
end $$;
grant select, insert, update, delete on class.followups to whub_app;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on class.followups from anon, authenticated';
  end if;
end $$;
