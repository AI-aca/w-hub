// 커트라인·1지망·학생 리포트·모의고사 성적표·엑셀 백업 (성적·주말반 권한). 계산 규칙은 lib/weekly_admit.ts, lib/weekly_report.ts(참고사이트와 같음, 문서 50).
// 커트라인 = 학기 × 모의 회차 × 그룹, 1·2지망 = 수강 등록 줄, 리포트 총평 = 학기 × 학생 × 차수(고친 문안만 저장).
import type { Tx } from "../../lib/db.ts";
import { log } from "../../lib/audit.ts";
import { defineAction } from "../../lib/registry.ts";
import { termOf } from "../../lib/scope.ts";
import { fail, str } from "../../lib/util.ts";
import { type Adm, GROUPS, grpOf, isSchool, recommend } from "../../lib/weekly_admit.ts";
import { type Session, type Subject, weeksOf } from "../../lib/weekly_eval.ts";
import { windowsOf } from "../../lib/weekly_focus.ts";
import { actionPlan, chartNote, fuSummary, hwLetter, mockStats, mockTable, type MockS, pctOf, strengths, summaryText } from "../../lib/weekly_report.ts";
import { mean } from "../../lib/weekly_eval.ts";
import { rules } from "./actions.ts";
import { cutOf, evalData } from "./dashboard.ts";
import { followsOf, sessionsOf } from "./focus.ts";

const md = (s: string) => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`;

/** 학기의 모의 회차 자료: 주차·과목·수강생·모의 원점수·만점. 회차(1부터)마다 전체 수강생 기준 성적표 계산을 돕는다. */
async function mockWorld(tx: Tx, t: { id: number; course_id: number }) {
  const sessions = await sessionsOf(tx, t.id);
  const { weeks, weekOf } = weeksOf(sessions);
  const r = await rules(tx, t.course_id);
  const subjects = await tx`select id::int as id, name, category, sort from class.subjects where course_id = ${t.course_id} order by sort, id` as unknown as Subject[];
  const enr = await tx`select e.student_id, s.name, s.name_no, e.class_id::int as class_id, k.name as class_name, e.hope1, e.hope2
                       from class.enrollments e join people.students s on s.id = e.student_id left join class.classes k on k.id = e.class_id
                       where e.course_id = ${t.course_id} and e.status = 'active' order by s.name, s.name_no`;
  const recs = await tx`select r.session_id::int as session_id, r.student_id, c.subject_id::int as subject_id, r.mock::float as value
                        from class.records r join class.session_cells c on c.session_id = r.session_id and c.class_id = r.class_id
                        join class.sessions s on s.id = r.session_id
                        where s.term_id = ${t.id} and r.mock is not null and c.subject_id is not null`;
  const maxes = await tx`select m.session_id::int as session_id, m.subject_id::int as subject_id, m.max_score::float as m from class.mock_max m
                         join class.sessions s on s.id = m.session_id where s.term_id = ${t.id}`;
  const mm = new Map(maxes.map((x) => [`${x.session_id}:${x.subject_id}`, x.m as number]));
  const def = (r.mock_default ?? {}) as Record<string, number>;
  const ord = new Map(sessions.map((s) => [s.id, s.on_date + s.start_t]));
  const bySess = new Map<number, Session[]>();
  for (const s of [...sessions].sort((a, b) => (ord.get(a.id)!).localeCompare(ord.get(b.id)!))) {
    const w = weekOf.get(s.id)!;
    bySess.set(w, [...(bySess.get(w) ?? []), s]);
  }
  const cw = { m: Number(r.cat_weights?.["수학"] ?? 60), s: Number(r.cat_weights?.["과학"] ?? 40) };
  const cache = new Map<number, MockS>();
  const mockWeeks = weeks.filter((w) => w.mock);
  /** 모의 n회 전체 수강생 성적표 계산. 같은 주 같은 과목이 두 번이면 나중 회차 값(원본도 덮어씀) */
  const statsOf = (round: number): MockS => {
    const hit = cache.get(round);
    if (hit) return hit;
    const w = mockWeeks.find((x) => x.round === round);
    const last = new Map<string, { student_id: string; subject_id: number; value: number }>();
    if (w) {
      for (const x of [...recs].sort((a, b) => (ord.get(a.session_id as number) ?? "").localeCompare(ord.get(b.session_id as number) ?? ""))) {
        if (weekOf.get(x.session_id as number) === w.no) last.set(`${x.student_id}:${x.subject_id}`, { student_id: x.student_id as string, subject_id: x.subject_id as number, value: x.value as number });
      }
    }
    const max: Record<number, number | null> = {};
    for (const sb of subjects) {
      max[sb.id] = null;
      for (const s of (w ? bySess.get(w.no) ?? [] : [])) {
        const v = mm.get(`${s.id}:${sb.id}`) ?? (def[String(sb.id)] != null ? Number(def[String(sb.id)]) : null);
        if (v != null) { max[sb.id] = v; break; }
      }
    }
    const S = mockStats({ students: enr.map((e) => e.student_id as string), subjects, recs: [...last.values()], max, cw });
    cache.set(round, S);
    return S;
  };
  const rounds = mockWeeks.map((w) => ({ round: w.round!, date: w.from, label: md(w.from), has: [...recs].some((x) => weekOf.get(x.session_id as number) === w.no) }));
  return { sessions, weeks, mockWeeks, subjects, enr, rules: r, cw, statsOf, rounds, max: (round: number) => statsOf(round).max };
}

const hopeIn = (v: unknown, what: string): string => {
  const s = str(v, 40);
  if (s && !isSchool(s)) fail(`${what}: 목록에 있는 학교를 고르세요.`);
  return s;
};

export default [
  /** 리포트(차수 k): 한 반 학생 모두의 리포트 자료. k 없으면 1차. 모의가 3회 미만이면 차수가 없다. */
  defineAction({
    name: "reportData", who: { area: "scores_weekly", need: "viewer" },
    run: async ({ tx, ws, body }) => {
      const t = await termOf(tx, ws, body.term_id);
      const [term] = await tx`select ends_on::text as ends_on from class.terms where id = ${t.id}`;
      const classId = Number(body.class_id);
      const W = await mockWorld(tx, t);
      const wins = windowsOf(W.weeks, term?.ends_on ?? null);
      const kwins = wins.filter((w) => w.k >= 1);
      if (!kwins.length) return { ok: true, wins: [], k: 0, win: null, students: [], reports: [], mockCount: W.mockWeeks.length };
      const w = kwins.find((x) => x.k === Number(body.k)) ?? kwins[0];
      const k = w.k, a = 3 * k - 2, b = 3 * k;
      const d = await evalData(tx, t.id, t.course_id, classId, w.upto);
      const follows = await followsOf(tx, t.id) as unknown as { student_id: string; on_date: string; kind: string }[];
      const saved = new Map((await tx`select student_id, body from class.reports where term_id = ${t.id} and k = ${k}`).map((x) => [x.student_id as string, x.body as string]));
      const names = await tx`select c.subject_id::int as subject_id, f.name from class.session_cells c join class.sessions s on s.id = c.session_id
                             join org.staff f on f.id = c.staff_id where s.term_id = ${t.id} and s.kind = 'class' and c.class_id = ${classId} and c.subject_id is not null
                             group by c.subject_id, f.name order by c.subject_id, min(s.on_date::text || s.start_t)`;
      const tch = (sub: number) => names.filter((x) => x.subject_id === sub).map((x) => x.name as string).join(" · ") || "담당";
      const dateOf = (m: number) => { const x = W.mockWeeks.find((y) => y.round === m); return x ? md(x.from) : ""; };
      const st = d.st;
      const reports: Record<string, unknown>[] = [];
      for (const r of d.rows) {
        if (!r.trend.some((x) => x.round === b)) continue;
        const rs = r.trend.filter((x) => x.round >= a && x.round <= b);
        const pm = (f: "comp" | "math" | "sci") => mean(rs.map((x) => x[f]));
        const pc = (f: "comp" | "math" | "sci") => mean(rs.map((x) => st.round[x.round] && st.round[x.round][f]).filter((v): v is number => v != null));
        const g1 = grpOf(r.hope1), h1: Adm | null = g1 != null ? r.adm[g1] : null, rec = recommend(r.adm);
        const sw = strengths(r, st, d.subjects);
        const auto = summaryText(r, st, r.adm, k, d.subjects, r.hope1);
        const rounds: number[] = [];
        for (let m = 1; m <= b; m++) if (st.round[m] || r.trend.some((x) => x.round === m)) rounds.push(m);
        reports.push({
          student_id: r.student_id, name: r.name, rank: r.rank, n: d.list.length, hope1: r.hope1, hope2: r.hope2,
          summary: { text: saved.get(r.student_id) ?? auto, auto, saved: saved.has(r.student_id) },
          kpi: [
            { l: "모의고사 환산 총점 (200)", v: pm("comp"), c: pc("comp") }, { l: "모의고사 수학 (100)", v: pm("math"), c: pc("math") },
            { l: "모의고사 과학 (100 환산)", v: pm("sci"), c: pc("sci") }, { l: "최종 종합점수", v: r.final, c: st.final },
          ],
          chart: {
            rounds, from: a, to: b, me: r.trend.filter((x) => rounds.includes(x.round)).map((x) => ({ round: x.round, comp: x.comp })),
            avg: rounds.filter((m) => st.round[m]).map((m) => ({ round: m, comp: st.round[m].comp })),
            cut: g1 != null ? rounds.filter((m) => d.cut[m] && d.cut[m][g1] != null).map((m) => ({ round: m, value: d.cut[m][g1] as number })) : [],
          },
          chartNote: chartNote(r, st, k, h1, r.hope1),
          good: sw.good.map((x) => x.t), bad: sw.bad.map((x) => x.t),
          mock: mockTable(r, a, b, d.subjects, W.statsOf, dateOf),
          adm: r.adm, rec: rec ? { gname: rec.gname, pv: rec.pv } : null, hopeG: [grpOf(r.hope1), grpOf(r.hope2)],
          bars: d.subjects.filter((s) => r.sub[s.id] != null).map((s) => ({ name: s.name, v: r.sub[s.id], avg: st.sub[s.id] ?? null })),
          habit: {
            att: r.agg.att, attAvg: st.att, hw: r.agg.hw, hwAvg: st.hw, hwL: hwLetter(r.agg.hw), act: r.agg.act, actAvg: st.act, test: r.agg.test, testAvg: st.test,
            ntM: r.ntM, ntMAvg: st.ntM, ntS: r.ntS, ntSAvg: st.ntS,
          },
          care: fuSummary(r.student_id, k, wins, follows),
          plan: actionPlan(r, st, r.adm, d.subjects, r.hope1, tch),
        });
      }
      return {
        ok: true, wins: kwins, k, win: w, students: d.rows.map((r) => ({ student_id: r.student_id, name: r.name, has: reports.some((x) => x.student_id === r.student_id) })),
        reports, cut: d.cut, groups: GROUPS, mockCount: W.mockWeeks.length,
      };
    },
  }),

  /** 리포트 총평 저장(고친 문안). 빈 문안이면 저장본을 지워 자동 문안으로 돌아간다. */
  defineAction({
    name: "reportTextSave", who: { area: "scores_weekly", need: "editor" },
    run: async ({ tx, ws, body, me }) => {
      const t = await termOf(tx, ws, body.term_id);
      const sid = str(body.student_id, 40), k = Number(body.k);
      if (!Number.isInteger(k) || k < 1 || k > 9) fail("차수가 올바르지 않습니다.");
      if (!(await tx`select 1 from class.enrollments where course_id = ${t.course_id} and student_id = ${sid}`).length) fail("이 과정의 학생이 아닙니다.");
      const text = str(body.body, 3000);
      if (!text) await tx`delete from class.reports where term_id = ${t.id} and student_id = ${sid} and k = ${k}`;
      else await tx`insert into class.reports (term_id, student_id, k, body, updated_by) values (${t.id}, ${sid}, ${k}, ${text}, ${me.email})
                    on conflict (term_id, student_id, k) do update set body = excluded.body, updated_by = excluded.updated_by, updated_at = now()`;
      await log(tx, me.email, "리포트 총평 저장", { term: t.id, k, reset: !text }, ws, "scores_weekly");
      return { ok: true, saved: !!text };
    },
  }),

  /** 커트라인 한 칸 저장(관리 권한). 빈 값이면 비운다(그 회차 줄은 남음 — 원본과 같음). 0~200 밖은 거절. */
  defineAction({
    name: "cutSave", who: { area: "scores_weekly", need: "admin" },
    run: async ({ tx, ws, body, me }) => {
      const t = await termOf(tx, ws, body.term_id);
      const round = Number(body.round), grp = Number(body.grp);
      const sessions = await sessionsOf(tx, t.id);
      const n = weeksOf(sessions).weeks.filter((x) => x.mock).length;
      if (!Number.isInteger(round) || round < 1 || round > n) fail("이 학기의 모의고사 회차가 아닙니다.");
      if (!Number.isInteger(grp) || grp < 0 || grp >= GROUPS.length) fail("커트라인 그룹이 올바르지 않습니다.");
      const v = body.value == null || body.value === "" ? null : Number(body.value);
      if (v != null && (!Number.isFinite(v) || v < 0 || v > 200)) fail("커트라인은 0~200점 사이로 입력하세요.");
      const val = v == null ? null : Math.round(v * 10) / 10;
      await tx`insert into class.cutlines (term_id, round, grp, value, updated_by) values (${t.id}, ${round}, ${grp}, ${val}, ${me.email})
               on conflict (term_id, round, grp) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`;
      await log(tx, me.email, "커트라인 저장", { term: t.id, round, grp, value: val }, ws, "scores_weekly");
      return { ok: true, cut: await cutOf(tx, t.id) };
    },
  }),

  /** 1·2지망 저장(입력 권한). 목록에 있는 학교이거나 빈 값. */
  defineAction({
    name: "hopeSave", who: { area: "scores_weekly", need: "editor" },
    run: async ({ tx, ws, body, me }) => {
      const t = await termOf(tx, ws, body.term_id);
      const sid = str(body.student_id, 40), f = str(body.field, 6);
      if (f !== "hope1" && f !== "hope2") fail("1지망·2지망만 고칠 수 있습니다.");
      const v = hopeIn(body.value, f === "hope1" ? "1지망" : "2지망");
      const [e] = f === "hope1"
        ? await tx`update class.enrollments set hope1 = ${v}, updated_by = ${me.email}, updated_at = now() where course_id = ${t.course_id} and student_id = ${sid} returning student_id`
        : await tx`update class.enrollments set hope2 = ${v}, updated_by = ${me.email}, updated_at = now() where course_id = ${t.course_id} and student_id = ${sid} returning student_id`;
      if (!e) fail("이 과정의 학생이 아닙니다.");
      await log(tx, me.email, "지망 학교 저장", { term: t.id, field: f, value: v }, ws, "scores_weekly");
      return { ok: true, value: v };
    },
  }),

  /** 모의고사 성적표(원점수·평균·백분위·환산·석차): 회차 × (반 거르기). 평균·백분위·석차는 과정 전체 수강생 기준(원본 '3학년 전체'). */
  defineAction({
    name: "mockSheet", who: { area: "scores_weekly", need: "viewer" },
    run: async ({ tx, ws, body }) => {
      const t = await termOf(tx, ws, body.term_id);
      const W = await mockWorld(tx, t);
      const have = W.rounds.filter((x) => x.has);
      const round = W.rounds.find((x) => x.round === Number(body.round))?.round ?? have.at(-1)?.round ?? W.rounds[0]?.round ?? 0;
      if (!round) return { ok: true, rounds: [], round: 0, subjects: [], rows: [] };
      const S = W.statsOf(round);
      const cls = body.class_id == null || body.class_id === "" ? null : Number(body.class_id);
      const rows = W.enr.filter((e) => S.by[e.student_id as string] && (cls == null || e.class_id === cls)).map((e) => {
        const o = S.by[e.student_id as string];
        return {
          student_id: e.student_id, name: e.name, class_id: e.class_id, class_name: e.class_name,
          v: Object.fromEntries(W.subjects.map((s) => [s.id, o[s.id] ?? null])),
          ms: o.ms ?? null, ss: o.ss ?? null, tot: o.tot ?? null, cm: o.cm ?? null, cs: o.cs ?? null, conv: o.conv ?? null,
          pms: o.ms != null ? pctOf(S.ms.vals, o.ms) : null, pss: o.ss != null ? pctOf(S.ss.vals, o.ss) : null, pconv: o.conv != null ? pctOf(S.conv.vals, o.conv) : null,
          rank: o.conv != null ? S.rank(o.conv) : null,
        };
      }).sort((a, b) => (b.conv ?? -1) - (a.conv ?? -1));
      return {
        ok: true, rounds: W.rounds, round, subjects: W.subjects.filter((s) => s.category !== "기타"), max: S.max, mx: S.mx, sx: S.sx, cnt: S.cnt, rows,
        avg: { sub: Object.fromEntries(W.subjects.map((s) => [s.id, S.sub[s.id].avg])), ms: S.ms.avg, ss: S.ss.avg, tot: S.tot.avg, cm: S.cm.avg, cs: S.cs.avg, conv: S.conv.avg },
      };
    },
  }),

  /** 엑셀 백업 자료: 학생·성적 기록·모의고사·사후관리·커트라인·모의 만점. 파일 만들기는 화면에서. 연락처는 뺐다(성적 권한만으로 새지 않게). */
  defineAction({
    name: "weeklyBackup", who: { area: "scores_weekly", need: "viewer" },
    run: async ({ tx, ws, body, me }) => {
      const t = await termOf(tx, ws, body.term_id);
      const [term] = await tx`select name from class.terms where id = ${t.id}`;
      const W = await mockWorld(tx, t);
      const cut = await cutOf(tx, t.id);
      const follows = await followsOf(tx, t.id);
      const subj = new Map(W.subjects.map((s) => [s.id, s.name]));
      const who = new Map(W.enr.map((e) => [e.student_id as string, e]));
      const stu = await tx`select e.student_id, s.name, s.name_no, k.name as class_name, c.name as center, s.school_name, s.entry_year, e.hope1, e.hope2, e.note
                           from class.enrollments e join people.students s on s.id = e.student_id left join class.classes k on k.id = e.class_id
                           left join org.centers c on c.id = s.center_id where e.course_id = ${t.course_id} and e.status = 'active' order by s.name, s.name_no`;
      const records = await tx`select s.on_date::text as on_date, s.week_label, s.mock, k.name as class_name, st.name as student, st.name_no, c.subject_id::int as subject_id,
                                      r.att, r.book, r.beh, r.nt, r.hw, r.act, r.test::float as test, r.mock::float as mock
                               from class.records r join class.sessions s on s.id = r.session_id
                               join class.session_cells c on c.session_id = r.session_id and c.class_id = r.class_id
                               join class.classes k on k.id = r.class_id join people.students st on st.id = r.student_id
                               where s.term_id = ${t.id} order by s.on_date, s.start_t, k.sort, st.name, st.name_no, c.subject_id`;
      const num = (v: unknown) => v == null ? "" : Number(v);
      const mockRows: (string | number)[][] = [];
      for (const x of W.rounds.filter((y) => y.has)) {
        const S = W.statsOf(x.round);
        for (const [sid, o] of Object.entries(S.by)) {
          const e = who.get(sid);
          mockRows.push([`${x.round}회`, String(e?.class_name ?? ""), String(e?.name ?? sid), ...W.subjects.map((s) => o[s.id] ?? ""), o.ms ?? "", o.ss ?? "", o.tot ?? "",
            o.cm != null ? +o.cm.toFixed(1) : "", o.cs != null ? +o.cs.toFixed(1) : "", o.conv != null ? +o.conv.toFixed(1) : ""]);
        }
      }
      const sheets = [
        { name: "학생", rows: [["이름", "반", "센터", "학교", "입학연도", "1지망", "2지망", "비고"],
          ...stu.map((s) => [s.name, s.class_name ?? "", s.center ?? "", s.school_name, num(s.entry_year), s.hope1, s.hope2, s.note])] },
        { name: "성적기록", rows: [["주차", "날짜", "반", "학생", "과목", "출결", "교재 미지참", "태도 지적", "노트 미흡", "과제", "발표", "테스트", "모의고사 원점수"],
          ...records.map((r) => [r.mock ? `${r.week_label} (모의)` : r.week_label, r.on_date, r.class_name, r.name_no ? `${r.student}${r.name_no}` : r.student, subj.get(r.subject_id as number) ?? "",
            r.att ?? "출석", r.book ? 1 : "", num(r.beh), num(r.nt), r.hw ?? "", num(r.act), num(r.test), num(r.mock)])] },
        { name: "모의고사", rows: [["회차", "반", "학생", ...W.subjects.map((s) => s.name), "수학", "과학", "총점", "환산 수학", "환산 과학", "환산 총점"], ...mockRows] },
        { name: "사후관리", rows: [["날짜", "반", "학생", "과목", "유형", "교사", "내용"],
          ...follows.map((f) => [f.on_date, who.get(f.student_id as string)?.class_name ?? "", who.get(f.student_id as string)?.name ?? f.student_id, f.subject_id == null ? "담임" : subj.get(f.subject_id as number) ?? "", f.kind, f.staff_name, f.body])] },
        { name: "커트라인", rows: [["회차", ...GROUPS], ...W.mockWeeks.map((w) => [`${w.round}회`, ...GROUPS.map((_, gi) => cut[w.round!]?.[gi] ?? "")])] },
        { name: "모의고사 만점", rows: [["회차", ...W.subjects.map((s) => s.name)], ...W.mockWeeks.map((w) => [`${w.round}회`, ...W.subjects.map((s) => W.max(w.round!)[s.id] ?? "")])] },
      ];
      await log(tx, me.email, "엑셀 백업", { term: t.id, sheets: sheets.map((s) => `${s.name}:${s.rows.length - 1}`) }, ws, "scores_weekly");
      return { ok: true, term: term?.name ?? "", sheets };
    },
  }),
];
