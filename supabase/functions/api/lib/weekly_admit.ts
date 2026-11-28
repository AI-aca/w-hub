// 커트라인·1지망 판단(순수 함수). 참고사이트 SCHOOLS·GROUPS·admission·recommend·pvOf 와 같은 규칙 — 문서 50 대조표.
// 모의 종합(200점)의 최근 3회 평균을, 그 회차에 커트라인(합격 안전선)이 입력된 그룹별 안전선 평균과 비교한다.
import { mean, type Trend } from "./weekly_eval.ts";

/** 영재학교와 커트라인 그룹(원본 상수 그대로). [학교, 그룹 번호] */
export const SCHOOLS: readonly (readonly [string, number])[] = [
  ["서울과학고", 0], ["경기과학고", 0], ["한국과학영재학교", 0],
  ["인천과학예술영재학교", 1], ["대구과학고", 1],
  ["대전과학고", 2], ["세종과학예술영재학교", 2],
  ["광주과학고", 3],
];
export const GROUPS = ["서울·경기·한과영", "인천·대구", "대전·세종", "광주"] as const;
export const schoolLabel = (n: string) => n === "한국과학영재학교" ? n + "(부산)" : n;
export const grpOf = (sch: string | null | undefined): number | null => SCHOOLS.find((s) => s[0] === sch)?.[1] ?? null;
export const isSchool = (n: string) => SCHOOLS.some((s) => s[0] === n);

/** 커트라인 표: 모의 회차 → 그룹 번호 → 값(빈 칸 null). 회차 키가 있으면 '그 회차에 커트라인 줄이 있음'(원본 cut[회차]). */
export type Cut = Record<number, Record<number, number | null>>;

/** 안전선과의 차이(점) → 판단. 0 이상 안전 · −10 이상 근접 · −20 이상 소신 · 그 아래 도전 */
const PVL: readonly (readonly [number, string])[] = [[0, "안전"], [-10, "근접"], [-20, "소신"], [-1e9, "도전"]];
export const pvOf = (m: number | null): string | null => m == null ? null : PVL.find((p) => m >= p[0])![1];

export interface Adm { gi: number; gname: string; cut: number | null; stu: number | null; m: number | null; pv: string | null; rounds?: number[] }

/** 학생의 모의 종합 추이에서 커트라인이 있는 최근 3회를 골라 그룹마다 비교 */
export function admission(trend: Trend[], cut: Cut): Adm[] {
  const rounds = trend.filter((t) => cut[t.round] != null).slice(-3);
  return GROUPS.map((gname, gi) => {
    const rs = rounds.filter((t) => cut[t.round][gi] != null);
    if (!rs.length) return { gi, gname, cut: null, stu: null, m: null, pv: null };
    const c = mean(rs.map((t) => cut[t.round][gi] as number))!, s = mean(rs.map((t) => t.comp))!, m = s - c;
    return { gi, gname, cut: c, stu: s, m, pv: pvOf(m), rounds: rs.map((t) => t.round) };
  });
}

/** 우리 판단: 안전(차이 ≥ 0)인 첫 그룹, 없으면 차이가 가장 큰(가장 가까운) 그룹 */
export function recommend(adm: Adm[]): Adm | null {
  const ok = adm.filter((a) => a.m != null && a.m >= 0);
  if (ok.length) return ok[0];
  const c = adm.filter((a) => a.m != null).sort((a, b) => b.m! - a.m!);
  return c[0] ?? null;
}
