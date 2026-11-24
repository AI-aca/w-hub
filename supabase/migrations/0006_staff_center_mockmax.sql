-- W-HUB 0006: 강사 소속 센터, 모의고사 만점을 회차×과목 설정으로(원장님 요청 2026-11-24)

alter table org.staff add column if not exists center_id bigint references org.centers(id) on delete set null;

-- 센터는 같은 작업공간 것만
create or replace function org.check_staff_center() returns trigger language plpgsql as $$
begin
  if new.center_id is not null and not exists (
    select 1 from org.centers c where c.id = new.center_id and c.workspace_id = new.workspace_id) then
    raise exception '다른 작업공간의 센터는 지정할 수 없습니다.';
  end if;
  return new;
end $$;
drop trigger if exists staff_center_ws on org.staff;
create trigger staff_center_ws before insert or update on org.staff
  for each row execute function org.check_staff_center();

-- 모의고사 만점: 반 칸마다(선생님 입력) → 모의 회차 × 과목마다 하나(관리 권한, 평가 설정 화면).
-- 참고사이트도 '모의고사 성적표'에서 관리자가 회차·과목별로 정했다. 4단계 뒤에는 모의고사 시험 설정에서 가져온다.
create table if not exists class.mock_max (
  session_id bigint not null references class.sessions(id) on delete cascade,
  subject_id bigint not null references class.subjects(id) on delete cascade,
  max_score  numeric(6,1) not null check (max_score > 0 and max_score <= 1000),
  updated_at timestamptz not null default now(),
  updated_by text not null default '',
  primary key (session_id, subject_id)
);
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'class' and table_name = 'session_cells' and column_name = 'mock_max') then
    insert into class.mock_max (session_id, subject_id, max_score)
      select session_id, subject_id, max(mock_max) from class.session_cells
      where mock_max is not null and subject_id is not null group by 1, 2
      on conflict do nothing;
    alter table class.session_cells drop column mock_max;
  end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array['mock_max'] loop
    execute format('alter table class.%I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname = 'class' and tablename = t and policyname = 'whub_app_all') then
      execute format('create policy whub_app_all on class.%I for all to whub_app using (true) with check (true)', t);
    end if;
  end loop;
end $$;
grant select, insert, update, delete on class.mock_max to whub_app;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on class.mock_max from anon, authenticated';
  end if;
end $$;

-- 과목별 모의고사 기본 만점(회차 만점을 안 정했을 때 쓰는 값). 참고사이트 MDEF(대수 40·기하 30·조합 30·과학 각 30)와 같은 역할.
-- 키 = 과목 id(문자), 값 = 만점. 과목 이름을 코드에 박지 않으려고 과정 설정에 둔다.
alter table class.rules add column if not exists mock_default jsonb not null default '{}'::jsonb;
