// 집중관리·과목 경보·조치(사후관리) 기록 (성적·주말반 권한). 규칙은 lib/weekly_focus.ts, lib/weekly_alerts.ts(참고사이트와 같음).
// 교사 = 시간표 상세 칸의 담당 강사, 담임 = 반 설정의 담임 강사. 조치 기록은 학생 × 과목(비면 담임) 단위.
import type { Tx } from "../../lib/db.ts";
import { log } from "../../lib/audit.ts";
import { ROLE_RANK } from "../../lib/perm.ts";
import { defineAction } from "../../lib/registry.ts";
import { refsOf, termOf, ymdDate } from "../../lib/scope.ts";
import { fail, str } from "../../lib/util.ts";
import { type ACell, type AFollow, type ARec, computeAlerts } from "../../lib/weekly_alerts.ts";
import { type Session, weeksOf } from "../../lib/weekly_eval.ts";
import { cause, inWin, windowsOf } from "../../lib/weekly_focus.ts";
import { rules } from "./actions.ts";
import { evalData } from "./dashboard.ts";

export const KINDS = ["보충수업", "학생 상담", "학부모 상담", "과제 재제출", "기타"];
const todayKST = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

async function sessionsOf(tx: Tx, termId: number): Promise<Session[]> {
  return await tx`select id::int as id, on_date::text as on_date, start_t, week_label, mock from class.sessions
                  where term_id = ${termId} and kind = 'class'` as unknown as Session[];
}
/** 그 학기에 반·과목을 맡은 강사(시간표 상세 칸) */
async function assignOf(tx: Tx, termId: number) {
  return await tx`select distinct c.class_id::int as class_id, c.subject_id::int as subject_id, c.staff_id
                  from class.session_cells c join class.sessions s on s.id = c.session_id
                  where s.term_id = ${termId} and s.kind = 'class' and c.subject_id is not null and c.staff_id is not null`;
}
async function followsOf(tx: Tx, termId: number) {
  return await tx`select f.id::int as id, f.student_id, f.class_id::int as class_id, f.subject_id::int as subject_id, f.staff_id,
                         coalesce(st.name, '') as staff_name, f.on_date::text as on_date, f.kind, f.body, f.alert_key, f.created_by
                  from class.followups f left join org.staff st on st.id = f.staff_id where f.term_id = ${termId} order by f.on_date, f.id`;
}
async function meStaff(tx: Tx, ws: string, email: string) {
  const [s] = await tx`select id from org.staff where workspace_id = ${ws} and email = ${email} limit 1`;
  return (s?.id as string | undefined) ?? null;
}

export default [
  defineAction({
    name: "focusData", who: { area: "scores_weekly", need: "viewer" },
    run: async ({ tx, ws, body, me }) => {
      const t = await termOf(tx, ws, body.term_id);
      const [term] = await tx`select ends_on::text as ends_on from class.terms where id = ${t.id}`;
      const sessions = await sessionsOf(tx, t.id);
      const { weeks, weekOf } = weeksOf(sessions);
      const wins = windowsOf(weeks, term?.ends_on ?? null);
      // 기본: 성적이 들어온 가장 최근 리포트(원본 latestK)
      const used = new Set((await tx`select distinct r.session_id::int as id from class.records r join class.sessions s on s.id = r.session_id
                                     where s.term_id = ${t.id}`).map((x) => weekOf.get(x.id as number)));
      let w = wins.find((x) => x.k === Number(body.k));
      if (!w) w = [...wins].reverse().find((x) => used.has(x.upto)) ?? wins[0];
      const assign = await assignOf(tx, t.id);
      const classes = await tx`select id::int as id, name, homeroom_staff_id from class.classes where course_id = ${t.course_id} and active order by sort, id`;
      const out = [];
      for (const c of classes) {
        const d = await evalData(tx, t.id, t.course_id, c.id as number, w.upto);
        const focus = [...d.list].sort((a, b) => a.final! - b.final!).slice(0, 5)
          .map((r) => ({ student_id: r.student_id, name: r.name, score: r.final, avg: d.st.final, weak: r.weak, weakScore: r.weak != null ? r.sub[r.weak] : null }));
        const subjects = assign.filter((a) => a.class_id === c.id).map((a) => ({
          subject_id: a.subject_id as number, staff_id: a.staff_id as string,
          items: d.list.filter((r) => r.sub[a.subject_id] != null).sort((x, y) => x.sub[a.subject_id] - y.sub[a.subject_id]).slice(0, 3)
            .map((r) => ({ student_id: r.student_id, name: r.name, score: r.sub[a.subject_id], avg: d.st.sub[a.subject_id] ?? null, cause: cause(r.comp[a.subject_id]) })),
        }));
        out.push({ id: c.id, name: c.name, homeroom_staff_id: c.homeroom_staff_id, n: d.list.length, focus, subjects });
      }
      const follows = (await followsOf(tx, t.id)).filter((f) => inWin(f.on_date as string, w!));
      return { ok: true, wins, k: w.k, win: w, classes: out, follows, me_staff: await meStaff(tx, ws, me.email), kinds: KINDS, today: todayKST() };
    },
  }),

  defineAction({
    name: "alertsTerm", who: { area: "scores_weekly", need: "viewer" },
    run: async ({ tx, ws, body, me }) => {
      const t = await termOf(tx, ws, body.term_id);
      const r = await rules(tx, t.course_id);
      const a0 = (r.alert ?? {}) as Record<string, number>;
      const cfg = { drop: Number(a0.drop ?? 15), gap: Number(a0.gap ?? 20), rep: Number(a0.rep ?? 2), days: Number(a0.days ?? 7) };
      const subjects = await tx`select id::int as id, name, category from class.subjects where course_id = ${t.course_id}`;
      const sessions = await sessionsOf(tx, t.id);
      const cells = await tx`select c.session_id::int as session_id, c.class_id::int as class_id, c.subject_id::int as subject_id, c.staff_id
                             from class.session_cells c join class.sessions s on s.id = c.session_id where s.term_id = ${t.id} and s.kind = 'class'`;
      const students = await tx`select e.student_id, s.name, e.class_id::int as class_id from class.enrollments e join people.students s on s.id = e.student_id
                                where e.course_id = ${t.course_id} and e.status = 'active'`;
      const records = await tx`select r.session_id::int as session_id, r.class_id::int as class_id, r.student_id, r.att, r.hw, r.nt, r.test::float as test,
                                      r.mock::float as mock, r.book, r.beh, r.act
                               from class.records r join class.sessions s on s.id = r.session_id where s.term_id = ${t.id}`;
      const maxes = await tx`select m.session_id::int as session_id, m.subject_id::int as subject_id, m.max_score::float as m from class.mock_max m
                             join class.sessions s on s.id = m.session_id where s.term_id = ${t.id}`;
      const mm = new Map(maxes.map((x) => [`${x.session_id}:${x.subject_id}`, x.m as number]));
      const def = (r.mock_default ?? {}) as Record<string, number>;
      const follows = await followsOf(tx, t.id);
      const today = todayKST();
      let alerts = computeAlerts({
        cfg, subjects: subjects as unknown as { id: number; name: string; category: string }[], sessions, cells: cells as unknown as ACell[],
        students: students as unknown as { student_id: string; name: string; class_id: number | null }[], records: records as unknown as ARec[],
        maxOf: (sid, sub) => mm.get(`${sid}:${sub}`) ?? (def[String(sub)] != null ? Number(def[String(sub)]) : null),
        follows: follows as unknown as AFollow[], today,
      });
      if (body.session_id != null) { // 성적 입력 화면: 그 칸(회차 × 반)의 이번 주 그 과목 경보만
        const c = (cells as unknown as ACell[]).find((x) => x.session_id === Number(body.session_id) && x.class_id === Number(body.class_id));
        const wk = weeksOf(sessions).weekOf.get(Number(body.session_id));
        alerts = c ? alerts.filter((a) => a.class_id === c.class_id && a.subject_id === c.subject_id && a.week === wk) : [];
      }
      return { ok: true, alerts, cfg, today, assign: await assignOf(tx, t.id), me_staff: await meStaff(tx, ws, me.email), kinds: KINDS };
    },
  }),

  defineAction({
    name: "followupSave", who: { area: "scores_weekly", need: "editor" },
    run: async ({ tx, ws, body, me }) => {
      const t = await termOf(tx, ws, body.term_id);
      const sid = str(body.student_id, 40);
      const [e] = await tx`select class_id::int as class_id from class.enrollments where course_id = ${t.course_id} and student_id = ${sid}`;
      if (!e) fail("이 과정의 학생이 아닙니다.");
      const ref = await refsOf(tx, ws, t.course_id, { subject_id: body.subject_id, staff_id: body.staff_id });
      const on = ymdDate(body.on_date);
      const kind = str(body.kind, 10);
      if (!KINDS.includes(kind)) fail("조치 유형을 고르세요.");
      const text = str(body.body, 500);
      if (!text) fail("내용을 입력하세요.");
      const ak = str(body.alert_key ?? "", 120) || null;
      const [row] = await tx`insert into class.followups (course_id, term_id, student_id, class_id, subject_id, staff_id, on_date, kind, body, alert_key, created_by)
                             values (${t.course_id}, ${t.id}, ${sid}, ${e.class_id}, ${ref.subject_id}, ${ref.staff_id}, ${on}, ${kind}, ${text}, ${ak}, ${me.email})
                             returning id::int as id`;
      await log(tx, me.email, "조치 기록", { id: row.id, term: t.id, subject: ref.subject_id, kind, alert: ak }, ws, "scores_weekly");
      return { ok: true, id: row.id };
    },
  }),

  defineAction({
    name: "followupDelete", who: { area: "scores_weekly", need: "editor" },
    run: async ({ tx, ws, body, me, access }) => {
      const id = Number(body.id);
      const [f] = await tx`select f.id, f.created_by from class.followups f join class.courses c on c.id = f.course_id where f.id = ${id} and c.workspace_id = ${ws}`;
      if (!f) fail("없는 기록입니다.", 404, "not_found");
      if (f.created_by !== me.email && ROLE_RANK[access!.role] < ROLE_RANK.admin) fail("직접 쓴 기록만 지울 수 있습니다.", 403, "forbidden");
      await tx`delete from class.followups where id = ${id}`;
      await log(tx, me.email, "조치 기록 지움", { id }, ws, "scores_weekly");
      return { ok: true };
    },
  }),
];
