// 2028 영재학교반(2028win) → 수업(주말반)
// 원본: School Record 프로젝트 weiz2028 스키마(읽기만). 대상: class.* · calendar.events · people.students · org.staff
// - 반·과목·강사 이름 → id. 글 속 HTML(굵게·색)은 지우고 '중요' 표시로 바꾼다. 셀 색칠·열 너비는 옮기지 않는다.
// - 학생: 센터 "송도센터" → 송도(앞부분 일치), 학년(중2 등) → 중1 입학 연도 = 2026 - 학년 + 1. 같은 학생은 옛 id(student_aliases)로 다시 찾는다.
// - 시간표·진도·업무 일정은 그 학기에 아직 자료가 없을 때만 넣는다(W-HUB 에서 고친 것을 덮지 않음).
import type { Job } from "../lib.ts";

const CLEAN = (x: string) => String.raw`btrim(replace(replace(replace(replace(replace(regexp_replace(regexp_replace(coalesce(${x}, ''),
  '<br\s*/?>|</div>|</p>', E'\n', 'gi'), '<[^>]*>', '', 'g'), '&amp;', '&'), '&lt;', '<'), '&gt;', '>'), '&nbsp;', ' '), '&quot;', '"'), E' \n\r\t')`;
const IMP = (x: string) => String.raw`(coalesce(${x}, '') ~* '<(b|strong|font|span)[ >]')`;
const DATE = (x: string) => String.raw`case when ${x} ~ '^\d{2}-\d{2}-\d{2}' then ('20' || substr(${x}, 1, 8))::date end`;
const NUM = (x: string) => String.raw`nullif(regexp_replace(${CLEAN(x)}, '[^0-9.]', '', 'g'), '')::numeric`;
const CELLS = String.raw`jsonb_agg(jsonb_build_object('class', classname, 'subject', nullif(subject, ''), 'staff', nullif(instructor, ''), 'note', ${CLEAN("note")})
  order by classname) filter (where coalesce(classname, '') not in ('', '전체'))`;

const extract = String.raw`
with ui as (select key, value from weiz2028.ui_settings),
ms as (select e.value as s, e.ordinality as o from ui, jsonb_array_elements(ui.value::jsonb) with ordinality e where ui.key = 'managed_subjects'),
mc as (select e.value #>> '{}' as name, e.ordinality as o from ui, jsonb_array_elements(ui.value::jsonb) with ordinality e where ui.key = 'managed_classes'),
tt as (select *, split_part(type, '|', 1) as kind, coalesce(nullif(split_part(type, '|', 2), ''), id) as grp from weiz2028.timetables),
r as (
  select jsonb_build_object('t', 'term', 'term', 1, 'name', '[1차] 26년 8~12월', 'from', '2026-08-01', 'to', '2026-12-31') as j
  union all select jsonb_build_object('t', 'term', 'term', 2, 'name', '[2차] 27년 1~7월', 'from', '2027-01-01', 'to', '2027-07-31')
  union all select jsonb_build_object('t', 'subject', 'name', s->>'name', 'category', case when s->>'category' in ('수학','과학') then s->>'category' else '기타' end,
                                      'emoji', coalesce(s->>'emoji', ''), 'sort', o) from ms
  union all select jsonb_build_object('t', 'subject', 'name', x.subject, 'category', x.cat, 'emoji', '', 'sort', 100)
    from (select distinct subject, '수학' as cat from weiz2028.curriculums union select distinct subject, '과학' from weiz2028.curriculums_science
          union select distinct subject, '기타' from weiz2028.timetables) x
    where coalesce(x.subject, '') not in ('', '휴일') and x.subject not in (select s->>'name' from ms)
      and not (x.cat = '기타' and x.subject in (select subject from weiz2028.curriculums union select subject from weiz2028.curriculums_science))
  union all select jsonb_build_object('t', 'class', 'name', name, 'sort', o) from mc
  union all select jsonb_build_object('t', 'class', 'name', c, 'sort', 100) from (
      select distinct btrim(unnest(string_to_array(class_name, ','))) as c from weiz2028.students
      union select distinct classname from weiz2028.timetables union select distinct class_name from weiz2028.curriculums
      union select distinct class_name from weiz2028.curriculums_science) x
    where coalesce(c, '') not in ('', '전체') and c not in (select name from mc)
  union all select jsonb_build_object('t', 'staff', 'name', btrim(instructorname), 'phone', coalesce(phone, ''), 'email', lower(btrim(coalesce(email, ''))),
      'memo', coalesce(note, ''), 'subjects', coalesce((select jsonb_agg(p) from unnest(string_to_array(subsubject, '|')) p where p <> ''), '[]'::jsonb))
    from weiz2028.instructors where coalesce(btrim(instructorname), '') <> ''
  union all select jsonb_build_object('t', 'student', 'key', id, 'name', btrim(name), 'center', btrim(replace(coalesce(center, ''), '센터', '')),
      'school', btrim(coalesce(school, '')), 'grade', nullif(regexp_replace(coalesce(grade, ''), '\D', '', 'g'), '')::int,
      'sp', coalesce(studentphone, ''), 'pp', coalesce(parentphone, ''), 'note', ${CLEAN("note")},
      'classes', coalesce((select jsonb_agg(btrim(c)) from unnest(string_to_array(class_name, ',')) c where btrim(c) <> ''), '[]'::jsonb),
      'alg', ${NUM("pre_score_alg")}, 'geo', ${NUM("pre_score_geo")}, 'com', ${NUM("pre_score_com")})
    from weiz2028.students where coalesce(btrim(name), '') <> ''
  union all select jsonb_build_object('t', 'slot', 'term', term, 'key', grp,
      'weekday', array_position(array['일요일','월요일','화요일','수요일','목요일','금요일','토요일'], min(date)) - 1,
      'start', coalesce(min(start), ''), 'end', coalesce(min("end"), ''), 'cells', coalesce(${CELLS}, '[]'::jsonb))
    from tt where kind = '요약' and date in ('일요일','월요일','화요일','수요일','목요일','금요일','토요일') group by term, grp
  union all select jsonb_build_object('t', 'session', 'term', term, 'key', grp, 'date', min(${DATE("date")}),
      'start', coalesce(min(start), ''), 'end', coalesce(min("end"), ''),
      'week', (select ${CLEAN("coalesce(max(value) filter (where key = 'tt_fmt_ttwk_' || grp), max(value) filter (where key = 'tt_week_' || grp))")} from ui),
      'cells', coalesce(${CELLS}, '[]'::jsonb))
    from tt where kind = '상세' and ${DATE("date")} is not null group by term, grp
  union all select jsonb_build_object('t', 'holiday', 'term', term, 'key', grp, 'date', min(${DATE("date")}),
      'note', min(${CLEAN("note")}), 'important', bool_or(${IMP("note")}))
    from tt where kind = '휴일' and ${DATE("date")} is not null group by term, grp
  union all select jsonb_build_object('t', 'curr', 'term', term, 'cat', cat, 'week', nullif(regexp_replace(week, '\D', '', 'g'), '')::int,
      'subject', subject, 'class', class_name, 'content', ${CLEAN("content")}, 'important', ${IMP("content")})
    from (select *, '수학' as cat from weiz2028.curriculums union all select *, '과학' from weiz2028.curriculums_science) c
    where coalesce(class_name, '') <> '' and coalesce(subject, '') <> '' and ${CLEAN("content")} <> '' and week ~ '\d'
  union all select jsonb_build_object('t', 'event', 'term', term, 'date', ${DATE("date")}, 'title', ${CLEAN("content")},
      'status', case when status = '완료' then 'done' else 'todo' end, 'note', ${CLEAN("note")}, 'important', ${IMP("content")})
    from weiz2028.preschedules where ${DATE("date")} is not null
)
select jsonb_build_object('rows', jsonb_agg(j order by j->>'t', j->>'term', j->>'key', j->>'name'),
  'check', (select jsonb_object_agg(t, n) || jsonb_build_object('rows', (select count(*) from r))
            from (select j->>'t' as t, count(*) as n from r group by 1) x)) as data
from r`;

const load = String.raw`
do $load$
declare
  ws constant text := 'weiz';
  cid bigint; tid bigint; x jsonb; c jsonb; sid uuid; nid bigint; cen bigint; terms jsonb := '{}'::jsonb; fresh jsonb := '{}'::jsonb;
  m record;
begin
  insert into class.courses (workspace_id, name) values (ws, '2028 영재학교반') on conflict (workspace_id, name) do nothing;
  select id into cid from class.courses where workspace_id = ws and name = '2028 영재학교반';
  for x in select r from _in, jsonb_array_elements(d->'rows') r where r->>'t' = 'term' loop
    insert into class.terms (course_id, name, sort, starts_on, ends_on) values (cid, x->>'name', (x->>'term')::int, (x->>'from')::date, (x->>'to')::date)
      on conflict (course_id, name) do nothing;
    select id into tid from class.terms where course_id = cid and name = x->>'name';
    terms := terms || jsonb_build_object(x->>'term', tid);
    fresh := fresh || jsonb_build_object(x->>'term', not exists (select 1 from class.sessions where term_id = tid)
      and not exists (select 1 from class.weeks where term_id = tid) and not exists (select 1 from calendar.events where term_id = tid));
  end loop;
  for x in select r from _in, jsonb_array_elements(d->'rows') r where r->>'t' = 'subject' loop
    insert into class.subjects (course_id, name, category, emoji, sort) values (cid, x->>'name', x->>'category', x->>'emoji', (x->>'sort')::int)
    on conflict (course_id, name) do nothing;
  end loop;
  for x in select r from _in, jsonb_array_elements(d->'rows') r where r->>'t' = 'class' loop
    insert into class.classes (course_id, name, sort) values (cid, x->>'name', (x->>'sort')::int) on conflict (course_id, name) do nothing;
  end loop;
  for x in select r from _in, jsonb_array_elements(d->'rows') r where r->>'t' = 'staff' loop
    if not exists (select 1 from org.staff where workspace_id = ws and name = x->>'name' and active) then
      insert into org.staff (workspace_id, name, email, phone, subjects, memo)
      values (ws, x->>'name', (select email from core.users where email = nullif(x->>'email', '')), x->>'phone',
              array(select jsonb_array_elements_text(x->'subjects')), x->>'memo');
    end if;
  end loop;
  for x in select r from _in, jsonb_array_elements(d->'rows') r where r->>'t' = 'student' loop
    select student_id into sid from people.student_aliases where source = 'weiz2028' and source_key = x->>'key';
    if sid is null then
      select id into cen from org.centers where workspace_id = ws and x->>'center' <> '' and name like (x->>'center') || '%' order by sort limit 1;
      select id into sid from people.students where workspace_id = ws and status = 'active' and name = x->>'name' and name_no = 0
        and coalesce(center_id, 0) = coalesce(cen, 0) and school_name = x->>'school';
      if sid is null then
        insert into people.students (workspace_id, name, center_id, school_name, entry_year, student_phone, parent_phone, memo, created_by, updated_by)
        values (ws, x->>'name', cen, x->>'school', case when (x->>'grade')::int between 1 and 3 then 2026 - (x->>'grade')::int + 1 end,
                x->>'sp', x->>'pp', x->>'note', 'migrate:weiz2028', 'migrate:weiz2028') returning id into sid;
      end if;
      insert into people.student_aliases (student_id, source, source_key) values (sid, 'weiz2028', x->>'key');
    end if;
    insert into class.enrollments (course_id, student_id, class_id, scores, note, updated_by)
    values (cid, sid, (select id from class.classes where course_id = cid and name = x->'classes'->>0),
            jsonb_build_object('alg', x->'alg', 'geo', x->'geo', 'com', x->'com',
              'total', case when coalesce(x->>'alg', x->>'geo', x->>'com') is null then null
                            else round(coalesce((x->>'alg')::numeric, 0) + coalesce((x->>'geo')::numeric, 0) + coalesce((x->>'com')::numeric, 0), 1) end),
            case when jsonb_array_length(x->'classes') > 1 then '옛 반: ' || array_to_string(array(select jsonb_array_elements_text(x->'classes')), ', ') else '' end,
            'migrate:weiz2028')
    on conflict (course_id, student_id) do nothing;
  end loop;
  for x in select r from _in, jsonb_array_elements(d->'rows') r where r->>'t' in ('slot', 'session', 'holiday', 'curr', 'event') loop
    if not (fresh->>(x->>'term'))::boolean then continue; end if;
    tid := (terms->>(x->>'term'))::bigint;
    if x->>'t' = 'slot' then
      insert into class.slots (term_id, weekday, start_t, end_t) values (tid, (x->>'weekday')::int, x->>'start', x->>'end') returning id into nid;
    elsif x->>'t' in ('session', 'holiday') then
      insert into class.sessions (term_id, on_date, start_t, end_t, kind, week_label, note, important, updated_by)
      values (tid, (x->>'date')::date, coalesce(x->>'start', ''), coalesce(x->>'end', ''), case when x->>'t' = 'holiday' then 'holiday' else 'class' end,
              case when coalesce(x->>'week', '') ~ '^\d+$' then (x->>'week') || '주차' else coalesce(x->>'week', '') end,
              coalesce(x->>'note', ''), coalesce((x->>'important')::boolean, false), 'migrate:weiz2028') returning id into nid;
    elsif x->>'t' = 'curr' then
      insert into class.weeks (term_id, category, no, label) values (tid, x->>'cat', (x->>'week')::int, (x->>'week') || '주차') on conflict do nothing;
      insert into class.curriculum (week_id, subject_id, class_id, content, important, updated_by)
      select w.id, s.id, k.id, x->>'content', (x->>'important')::boolean, 'migrate:weiz2028'
      from class.weeks w, class.subjects s, class.classes k
      where w.term_id = tid and w.category = x->>'cat' and w.no = (x->>'week')::int and s.course_id = cid and s.name = x->>'subject'
        and k.course_id = cid and k.name = x->>'class'
      on conflict do nothing;
    elsif x->>'t' = 'event' then
      insert into calendar.events (workspace_id, course_id, term_id, on_date, title, status, note, important, created_by, updated_by)
      values (ws, cid, tid, (x->>'date')::date, x->>'title', x->>'status', x->>'note', (x->>'important')::boolean, 'migrate:weiz2028', 'migrate:weiz2028');
    end if;
    if x->>'t' in ('slot', 'session') then
      for c in select * from jsonb_array_elements(x->'cells') loop
        for m in select (select id from class.classes where course_id = cid and name = c->>'class') as k,
                        (select id from class.subjects where course_id = cid and name = c->>'subject') as s,
                        (select id from org.staff where workspace_id = ws and name = c->>'staff' and active) as f loop
          if m.k is null then continue; end if;
          if x->>'t' = 'slot' then
            insert into class.slot_cells (slot_id, class_id, subject_id, staff_id, note) values (nid, m.k, m.s, m.f, coalesce(c->>'note', '')) on conflict do nothing;
          else
            insert into class.session_cells (session_id, class_id, subject_id, staff_id, note) values (nid, m.k, m.s, m.f, coalesce(c->>'note', '')) on conflict do nothing;
          end if;
        end loop;
      end loop;
    end if;
  end loop;
end $load$;`;

const checkTarget = String.raw`
with r as (select x from _in, jsonb_array_elements(d->'rows') x),
co as (select id from class.courses where workspace_id = 'weiz' and name = '2028 영재학교반'),
te as (select t.id from class.terms t join co on co.id = t.course_id),
n as (
  select 'term' as t, count(*) as v from r where x->>'t' = 'term' and exists (select 1 from class.terms t, co where t.course_id = co.id and t.name = x->>'name')
  union all select 'subject', count(*) from r where x->>'t' = 'subject' and exists (select 1 from class.subjects s, co where s.course_id = co.id and s.name = x->>'name')
  union all select 'class', count(*) from r where x->>'t' = 'class' and exists (select 1 from class.classes k, co where k.course_id = co.id and k.name = x->>'name')
  union all select 'staff', count(*) from r where x->>'t' = 'staff' and exists (select 1 from org.staff f where f.workspace_id = 'weiz' and f.name = x->>'name')
  union all select 'student', count(*) from r where x->>'t' = 'student' and exists (
      select 1 from people.student_aliases a join class.enrollments e on e.student_id = a.student_id join co on co.id = e.course_id
      where a.source = 'weiz2028' and a.source_key = x->>'key')
  union all select 'slot', count(*) from class.slots where term_id in (select id from te)
  union all select 'session', count(*) from class.sessions where term_id in (select id from te) and kind = 'class'
  union all select 'holiday', count(*) from class.sessions where term_id in (select id from te) and kind = 'holiday'
  union all select 'curr', count(*) from class.curriculum c join class.weeks w on w.id = c.week_id where w.term_id in (select id from te)
  union all select 'event', count(*) from calendar.events where term_id in (select id from te)
)
select (select jsonb_object_agg(t, v) from n where t in (select x->>'t' from r))
       || jsonb_build_object('rows', (select sum(v) from n where t in (select x->>'t' from r)))`;

const job: Job = {
  id: "weiz2028",
  source: "School Record · weiz2028(2028 영재학교반)",
  target: "class.* · calendar.events · people.students · org.staff",
  extract, load, checkTarget,
};
export default job;
