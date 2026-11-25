// 집중관리(순수 함수). 참고사이트 fuWin·cause 와 같은 규칙 — 문서 47 대조표 3절.
// n차 리포트 = 모의 3n회까지의 성적. 조치 기록은 모의 3n회 날부터 모의 3(n+1)회 날 전까지(마지막은 학기 끝까지)만 센다.
import type { Comp, Week } from "./weekly_eval.ts";

export interface Win { k: number; upto: number; from: string; to: string; label: string }

const md = (s: string) => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`;
const addD = (s: string, k: number) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + k)).toISOString().slice(0, 10); };

/** 기간 목록. 모의가 3회 미만이면 k=0 '지금까지'(학기 전체 성적·전체 기록) 하나. */
export function windowsOf(weeks: Week[], termEnd: string | null): Win[] {
  const mocks = weeks.filter((w) => w.mock);
  const K = Math.floor(mocks.length / 3), out: Win[] = [];
  const end = termEnd ?? "9999-12-30";
  for (let k = 1; k <= K; k++) {
    const a = mocks[3 * k - 1], b = mocks[3 * k + 2];
    const to = b ? b.from : addD(end, 1);
    out.push({ k, upto: a.no, from: a.from, to, label: `${md(a.from)} ~ ${b ? md(b.from) : termEnd ? md(termEnd) : "학기 끝"}` });
  }
  if (!out.length) out.push({ k: 0, upto: weeks.length ? weeks[weeks.length - 1].no : 0, from: "0000-01-01", to: addD(end, 1), label: "지금까지" });
  return out;
}
export const inWin = (d: string, w: Win) => d >= w.from && d < w.to;

const f1 = (v: number | null) => v == null ? "-" : v.toFixed(1);
/** 과목 종합이 낮은 까닭: 모의·테스트·과제 중 가장 낮은 것, 노트 미흡, 태도 지적 */
export function cause(c: Comp | undefined): string {
  if (!c) return "";
  const out: string[] = [];
  const parts = ([["모의고사", c.mock], ["테스트", c.test], ["과제", c.homework]] as [string, number | null][])
    .filter((x) => x[1] != null).sort((a, b) => a[1]! - b[1]!);
  if (parts[0]) out.push(`${parts[0][0]} ${f1(parts[0][1])}`);
  if (c.nt) out.push(`노트 미흡 ${c.nt}회`);
  if (c.attitude < 100) out.push(`태도 지적 ${Math.round((100 - c.attitude) / 3)}회`);
  return out.join(" · ");
}
