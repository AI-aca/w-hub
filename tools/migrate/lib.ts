// 옮겨 오기(기존 DB → W-HUB) 공통 틀.
// 한 작업(Job)은 SQL 세 조각이다. 같은 SQL 을 두 가지 길로 실행한다.
//   1) 직접: 두 DB 주소로 접속해 실행(로컬 시험·CI)
//   2) SQL 편집기: 원본 편집기에서 extract 를 돌려 나온 JSON 을, W-HUB 편집기용 스크립트로 감싸 실행
// 원본은 읽기만 한다. W-HUB 쪽은 한 트랜잭션이며, 대조가 어긋나면 예외로 전부 되돌린다.

export interface Job {
  id: string;
  /** 사람이 읽는 출처(프로젝트·표) */
  source: string;
  /** 사람이 읽는 대상(W-HUB 표) */
  target: string;
  /** 원본에서 실행. 열 하나(data)에 {"rows": [...], "check": {...}} 를 돌려준다. check 에는 반드시 rows(옮길 줄 수)가 있다. */
  extract: string;
  /** W-HUB 에서 실행. 임시 표 _in(d jsonb) 의 d->'rows' 를 읽어 넣는다. 다시 돌려도 같은 결과여야 한다. */
  load: string;
  /** W-HUB 에서 실행. extract 의 check 와 같은 키를 가진 jsonb 한 값(열 이름 c)을 돌려준다. */
  checkTarget: string;
}

export interface ExtractResult {
  rows: unknown[];
  check: Record<string, number>;
}

/** 데이터 안에 없는 달러 인용 표시를 고른다. */
export function quoteTag(text: string): string {
  for (let i = 0; ; i++) {
    const tag = `$wh${i}$`;
    if (!text.includes(tag)) return tag;
  }
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function parseExtract(raw: unknown): ExtractResult {
  const v = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!v || typeof v !== "object") throw new Error("extract 결과가 JSON 이 아닙니다.");
  const { rows, check } = v as { rows?: unknown; check?: unknown };
  if (!Array.isArray(rows)) throw new Error("extract 결과에 rows 배열이 없습니다.");
  if (!check || typeof check !== "object" || typeof (check as Record<string, unknown>).rows !== "number") {
    throw new Error("extract 결과 check 에 rows(숫자)가 없습니다.");
  }
  if ((check as Record<string, number>).rows !== rows.length) throw new Error("check.rows 와 rows 개수가 다릅니다.");
  return { rows, check: check as Record<string, number> };
}

/**
 * W-HUB 에서 실행할 스크립트 한 덩어리.
 * 넣기 → 대조(다르면 예외 = 전부 되돌림) → 실행 기록(core.migration_runs) → commit(apply) 또는 rollback(시험 실행).
 * 마지막 select 가 결과(run_id·대상 대조값)를 보여 준다.
 */
export function targetScript(job: Job, data: ExtractResult, hash: string, opt: { apply: boolean; runBy: string }): string {
  const json = JSON.stringify(data);
  const q = quoteTag(json);
  const lit = (s: string) => "'" + s.replace(/'/g, "''") + "'";
  return [
    `-- W-HUB 옮겨 오기: ${job.id} (${job.source} → ${job.target})`,
    `-- ${opt.apply ? "실제 반영(commit)" : "시험 실행(rollback, 바뀌는 것 없음)"}`,
    "begin;",
    "create temp table _in(d jsonb) on commit drop;",
    `insert into _in values (${q}${json}${q}::jsonb);`,
    job.load.trim().replace(/;?\s*$/, ";"),
    "create temp table _chk on commit drop as",
    `  select (${job.checkTarget.trim().replace(/;\s*$/, "")}) as c;`,
    "do $chk$ declare want jsonb; got jsonb; begin",
    "  select d->'check' into want from _in; select c into got from _chk;",
    "  if got is distinct from want then raise exception '대조 불일치: 원본 % / W-HUB %', want, got; end if;",
    "end $chk$;",
    "insert into core.migration_runs (source, target, rows_in, rows_out, source_hash, result, detail, run_by)",
    `  select ${lit(job.source)}, ${lit(job.target)}, jsonb_array_length(d->'rows'), (select (c->>'rows')::int from _chk),`,
    `         ${lit(hash)}, 'ok', jsonb_build_object('job', ${lit(job.id)}, 'check', d->'check'), ${lit(opt.runBy)} from _in;`,
    "select (select max(id) from core.migration_runs) as run_id, (select c from _chk) as target_check;",
    opt.apply ? "commit;" : "rollback;",
    "",
  ].join("\n");
}
