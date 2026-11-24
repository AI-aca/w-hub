// 옮겨 오기 시험: 2028win → 수업 (로컬 Postgres :5433, db_reset 후). 옛 자료 모양(HTML·문자열 날짜·그룹 id)을 그대로 흉내 낸다.
import { deepStrictEqual, ok } from "node:assert";
import postgres from "postgres";
import { extract, load } from "../../tools/migrate/run.ts";
import job from "../../tools/migrate/jobs/weiz2028.ts";

const URL = "postgres://postgres@localhost:5433/postgres";
const sql = postgres(URL, { prepare: false, max: 1, onnotice: () => {} });

const SETUP = `
drop schema if exists weiz2028 cascade; create schema weiz2028;
create table weiz2028.students (id text, name text, center text, school text, grade text, parentphone text, studentphone text, note text, class_name text,
  pre_score_alg text, pre_score_geo text, pre_score_total text, pre_score_com text);
create table weiz2028.instructors (id text, instructorname text, subject text, subsubject text, phone text, email text, note text);
create table weiz2028.timetables (id text, date text, type text, start text, "end" text, classname text, subject text, instructor text, note text, regtime text, term smallint);
create table weiz2028.curriculums (id text, week text, subject text, content text, note text, term smallint, class_name text);
create table weiz2028.curriculums_science (like weiz2028.curriculums);
create table weiz2028.preschedules (id text, date text, content text, status text, note text, term smallint);
create table weiz2028.ui_settings (id text, key text, value text);
insert into weiz2028.ui_settings values
  ('u1', 'managed_classes', '["P반(Photon)","Q반(Quantum)"]'),
  ('u2', 'managed_subjects', '[{"name":"대수","category":"수학","emoji":"🧮"},{"name":"물리","category":"과학","emoji":"🍎"}]'),
  ('u3', 'tt_week_g-a', '<font color="#fbbf24">1</font>');
insert into weiz2028.instructors values ('i1', '정찬일', '수학', '대수|조합', '010-1', 'ed@test.kr', ''), ('i2', '문요섭', '수학', '기하|', '', '', '');
insert into weiz2028.students values
  ('s1', '김학생', '송도센터', '송도중', '2', '010-9', '010-8', '', 'Q반(Quantum)', '43.5', '42', '<b><font color="#10b981">128.5</font></b>', '43'),
  ('s2', '이학생', '한강센터', '김포중', '2', '', '', '메모', 'P반(Photon),Q반(Quantum)', '', '', '', '');
insert into weiz2028.timetables values
  ('t1', '토요일', '요약|g-s', '18:30', '21:30', 'P반(Photon)', '대수', '정찬일', null, null, 1),
  ('t2', '토요일', '요약|g-s', '18:30', '21:30', 'Q반(Quantum)', '기하', '문요섭', null, null, 1),
  ('t3', '26-08-22 (토)', '상세|g-a', '18:30', '21:30', 'P반(Photon)', '대수', '정찬일', null, null, 1),
  ('t4', '26-08-22 (토)', '상세|g-a', '18:30', '21:30', 'Q반(Quantum)', '기하', '문요섭', null, null, 1),
  ('t5', '26-09-26 (토)', '휴일|g-h', '00:00', '00:00', '전체', '휴일', '', '<b><font color="#ff6b6b">추석연휴 휴강</font></b>', null, 1),
  ('t6', '', '상세|g-x', '', '', 'P반(Photon)', '대수', '', null, 'tmp', 1);
insert into weiz2028.curriculums values
  ('c1', '1', '대수', 'S-Core<br>(Sec.1 &amp; Challenge)', 'g-1', 1, 'P반(Photon)'),
  ('c2', '1', '대수', '', 'g-1', 1, null),
  ('c3', '10', '기하', '<b>Olympiad</b>', 'g-2', 1, 'Q반(Quantum)');
insert into weiz2028.preschedules values
  ('p1', '26-07-21 (화)', '- 수학팀 대면회의', '완료', '', 1),
  ('p2', '26-08-22 (토)', '<b><font color="#fbbf24">- 첫 수업</font></b>', '진행 중', '점심', 1);
insert into core.users (email, name, status) values ('ed@test.kr', '정찬일', 'approved') on conflict do nothing;`;

const one = async (q: string) => (await sql.unsafe(q))[0];

Deno.test("2028win → 수업 옮겨 오기", async (t) => {
  await sql.unsafe(SETUP);
  const data = await extract(job, URL);

  await t.step("원본 정리: 빈 진도·날짜 없는 회차 빼고, 대조값", () => {
    deepStrictEqual(data.check, { rows: 18, term: 2, subject: 3, class: 2, staff: 2, student: 2, slot: 1, session: 1, holiday: 1, curr: 2, event: 2 });
  });

  await t.step("반영", async () => {
    const r = await load(job, URL, data, { apply: true, runBy: "test" });
    ok(r.run_id);
    const s = await one(`select s.on_date::text d, s.week_label w, (select string_agg(k.name || ':' || sb.name || ':' || coalesce(f.name, ''), ',' order by k.name)
      from class.session_cells c join class.classes k on k.id = c.class_id left join class.subjects sb on sb.id = c.subject_id left join org.staff f on f.id = c.staff_id
      where c.session_id = s.id) cells from class.sessions s where kind = 'class'`);
    deepStrictEqual(s, { d: "2026-08-22", w: "1주차", cells: "P반(Photon):대수:정찬일,Q반(Quantum):기하:문요섭" });
    deepStrictEqual(await one(`select note, important from class.sessions where kind = 'holiday'`), { note: "추석연휴 휴강", important: true });
    deepStrictEqual(await one(`select weekday, start_t from class.slots`), { weekday: 6, start_t: "18:30" });
    deepStrictEqual((await sql.unsafe(`select content, important from class.curriculum order by content`)).map((x) => [x.content, x.important]),
      [["Olympiad", true], ["S-Core\n(Sec.1 & Challenge)", false]]);
    deepStrictEqual(await one(`select name, category from class.subjects where name = '기하'`), { name: "기하", category: "수학" }, "목록에 없던 과목도 진도 구분으로");
    const st = await one(`select s.name, c.name center, s.entry_year, e.scores, k.name klass from people.students s join org.centers c on c.id = s.center_id
      join class.enrollments e on e.student_id = s.id left join class.classes k on k.id = e.class_id where s.name = '김학생'`);
    deepStrictEqual(st, { name: "김학생", center: "송도", entry_year: 2025, scores: { alg: 43.5, geo: 42, com: 43, total: 128.5 }, klass: "Q반(Quantum)" });
    deepStrictEqual(await one(`select c.name center, e.note from people.students s join org.centers c on c.id = s.center_id join class.enrollments e on e.student_id = s.id where s.name = '이학생'`),
      { center: "한강(김포)", note: "옛 반: P반(Photon), Q반(Quantum)" });
    deepStrictEqual(await one(`select email, subjects from org.staff where name = '정찬일'`), { email: "ed@test.kr", subjects: ["대수", "조합"] });
    deepStrictEqual((await sql.unsafe(`select title, status, important from calendar.events order by on_date`)).map((x) => [x.title, x.status, x.important]),
      [["- 수학팀 대면회의", "done", false], ["- 첫 수업", "todo", true]]);
  });

  await t.step("다시 돌려도 같은 결과(중복 없음, W-HUB 에서 고친 반은 그대로)", async () => {
    await sql.unsafe(`update class.enrollments set class_id = (select id from class.classes where name = 'P반(Photon)') where student_id = (select id from people.students where name = '김학생')`);
    await load(job, URL, data, { apply: true, runBy: "test" });
    deepStrictEqual(await one(`select (select count(*) from people.students)::int s, (select count(*) from class.sessions)::int n, (select count(*) from org.staff)::int f`), { s: 2, n: 2, f: 2 });
    deepStrictEqual(await one(`select k.name from class.enrollments e join class.classes k on k.id = e.class_id join people.students s on s.id = e.student_id where s.name = '김학생'`), { name: "P반(Photon)" });
  });

  await sql.unsafe("drop schema weiz2028 cascade;");
  await sql.end();
});
