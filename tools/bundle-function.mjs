// 대시보드 편집기에 붙여 넣을 한 파일짜리 함수 만들기: dist/platform.ts
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";

const map = { postgres: "npm:postgres@3.4.7", jose: "npm:jose@6.1.0" };
const r = await build({
  entryPoints: ["supabase/functions/platform/index.ts"],
  bundle: true, format: "esm", platform: "neutral", target: "es2022", write: false,
  external: Object.keys(map), legalComments: "none", charset: "utf8",
});
let code = r.outputFiles[0].text;
for (const [k, v] of Object.entries(map)) code = code.replaceAll(`from "${k}"`, `from "${v}"`);
const head = "// @ts-nocheck\n// W-HUB platform 함수 (자동 생성: tools/bundle-function.mjs — 원본은 supabase/functions/platform/)\n";
mkdirSync("dist", { recursive: true });
writeFileSync("dist/platform.ts", head + code);
console.log("dist/platform.ts", (head + code).length, "bytes, sha256", createHash("sha256").update(head + code).digest("hex").slice(0, 12));
