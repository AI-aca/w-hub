// 옮겨 오기 실행기.
//   deno run -A tools/migrate/run.ts list
//   deno run -A tools/migrate/run.ts extract-sql <작업>             원본 SQL 편집기에 붙일 SQL
//   deno run -A tools/migrate/run.ts target-sql <작업> <data.json> [--apply]
//                                                                  W-HUB SQL 편집기에 붙일 스크립트(기본: 시험 실행)
//   SOURCE_DB_URL=… TARGET_DB_URL=… deno run -A tools/migrate/run.ts run <작업> [--apply]
//                                                                  두 DB 에 직접 접속(원본은 읽기 전용 트랜잭션)
import postgres from "postgres";
import { type Job, parseExtract, sha256, targetScript } from "./lib.ts";
import { JOBS } from "./jobs/index.ts";

const find = (id: string): Job => {
  const j = JOBS.find((x) => x.id === id);
  if (!j) throw new Error(`작업 ${id} 이(가) 없습니다. list 로 확인하세요.`);
  return j;
};

/** 원본에서 extract 를 읽기 전용으로 실행한다. */
export async function extract(job: Job, sourceUrl: string) {
  const src = postgres(sourceUrl, { prepare: false, max: 1, onnotice: () => {} });
  try {
    return await src.begin(async (tx) => {
      await tx`set transaction read only`;
      const [r] = await tx.unsafe(job.extract);
      return parseExtract(r?.data);
    });
  } finally {
    await src.end();
  }
}

/** W-HUB 에 스크립트를 실행하고 결과(run_id·대조값)를 돌려준다. 대조가 어긋나면 예외. */
export async function load(job: Job, targetUrl: string, data: Awaited<ReturnType<typeof extract>>, opt: { apply: boolean; runBy: string }) {
  const dst = postgres(targetUrl, { prepare: false, max: 1, onnotice: () => {} });
  try {
    const script = targetScript(job, data, await sha256(JSON.stringify(data.rows)), opt);
    const res = await dst.unsafe(script).simple();
    const last = (res as unknown as Array<Array<Record<string, unknown>> | Record<string, unknown>>)
      .filter((x) => Array.isArray(x) && x.length && "target_check" in x[0]).pop() as Array<Record<string, unknown>> | undefined;
    return last?.[0] ?? {};
  } finally {
    await dst.end();
  }
}

if (import.meta.main) {
  const [cmd, id, file] = Deno.args.filter((a) => !a.startsWith("--"));
  const apply = Deno.args.includes("--apply");
  if (cmd === "list") {
    for (const j of JOBS) console.log(`${j.id}\t${j.source} → ${j.target}`);
  } else if (cmd === "extract-sql") {
    console.log(find(id).extract.trim() + ";");
  } else if (cmd === "target-sql") {
    const data = parseExtract(await Deno.readTextFile(file));
    console.log(targetScript(find(id), data, await sha256(JSON.stringify(data.rows)), { apply, runBy: "sql-editor" }));
  } else if (cmd === "run") {
    const s = Deno.env.get("SOURCE_DB_URL"), t = Deno.env.get("TARGET_DB_URL");
    if (!s || !t) throw new Error("SOURCE_DB_URL, TARGET_DB_URL 이 필요합니다.");
    const job = find(id);
    const data = await extract(job, s);
    console.log(`원본 ${data.rows.length}줄, 대조값 ${JSON.stringify(data.check)}`);
    const r = await load(job, t, data, { apply, runBy: "run.ts" });
    console.log(`${apply ? "반영" : "시험 실행(되돌림)"} 완료:`, JSON.stringify(r));
  } else {
    console.log("사용법은 파일 맨 위 주석을 보세요.");
    Deno.exit(1);
  }
}
