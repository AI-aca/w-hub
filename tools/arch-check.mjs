#!/usr/bin/env node
// W-HUB 구조 검사. 규칙을 어기면 "왜 안 되는지 + 어떻게 고치는지"를 알려 준다.
// 같은 지적을 두 번 하게 되면 여기에 규칙을 추가하고, tools/arch-samples 에 위반 표본도 하나 넣는다.
//   node tools/arch-check.mjs            저장소 전체 검사
//   node tools/arch-check.mjs --self     위반 표본(tools/arch-samples)이 모두 걸리는지 확인
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const rel = (p) => relative(ROOT, p).split(sep).join("/");

/** 규칙: files(경로 판별) · bad(줄 정규식) 또는 test(내용 → 위반 목록) · why · fix */
const RULES = [
  {
    id: "no-google-storage",
    files: (f) => /^(web\/src|supabase)\//.test(f) && /\.(ts|sql|mjs)$/.test(f),
    bad: /script\.google\.com|docs\.google\.com|drive\.google\.com|sheets\.googleapis\.com|googleapis\.com\/drive|DriveApp|SpreadsheetApp|DocumentApp/,
    why: "구글 드라이브·시트·문서·GAS 에 자료를 두거나 읽지 않는다(계획서 원칙 4). 구글은 로그인에만 쓴다.",
    fix: "파일은 Supabase Storage, 자료는 Supabase 표에 둔다. 옛 시트 자료는 옮겨 오기 스크립트로 한 번만 복사한다.",
  },
  {
    id: "no-old-site-links",
    files: (f) => /^web\/src\//.test(f),
    bad: /<iframe|ai-aca\.github\.io\/(?!w-hub)|wmock|wnaesin|School-Record|2028win|2027SCI|YSIE/i,
    why: "기존 사이트를 링크·iframe 으로 붙이는 것은 통합이 아니다(계획서 원칙 6).",
    fix: "그 기능을 W-HUB 영역 화면으로 다시 만든다. 아직 못 옮긴 영역은 메뉴에 내지 않고 홈에 '옮기는 중'으로만 표시한다.",
  },
  {
    id: "no-old-supabase",
    files: (f) => /^(web\/src|supabase\/functions)\//.test(f),
    bad: /[a-z0-9]{20}\.supabase\.co/,
    why: "W-HUB 는 새 Supabase 프로젝트 하나만 쓴다. 기존 프로젝트 주소를 코드에 두지 않는다(기존 DB 는 읽기 전용 복사 대상).",
    fix: "주소는 배포 변수(VITE_API_URL)로만 넣는다. 옛 DB 읽기는 옮겨 오기 스크립트에서만 한다.",
  },
  {
    id: "browser-dialogs",
    files: (f) => /^web\/src\//.test(f),
    bad: /(^|[^.\w])(alert|confirm|prompt)\(/,
    why: "브라우저 기본 창은 화면을 멈추고 모양이 제각각이다.",
    fix: "shared/ui/ui.ts 의 ask() · toast() 를 쓴다.",
  },
  {
    id: "area-isolation",
    files: (f) => /^web\/src\/areas\//.test(f),
    test: (src, f) => {
      const me = f.split("/")[3];
      return [...src.matchAll(/from\s+"([^"]+)"/g)]
        .filter((m) => /\/areas\//.test(m[1]) || (/^\.\.\/(?!\.\.)/.test(m[1]) && !m[1].startsWith("../" + me + "/")))
        .map((m) => m[0]);
    },
    why: "영역 화면끼리 서로 가져다 쓰면 하나 고칠 때 다른 영역이 깨진다.",
    fix: "같이 쓰는 것은 web/src/shared 로 옮긴다. 다른 영역 화면으로 가려면 shared/core/route 의 href()/go() 를 쓴다.",
  },
  {
    id: "shared-no-upward",
    files: (f) => /^web\/src\/shared\//.test(f),
    bad: /from\s+"[^"]*\/(areas|shell)\//,
    why: "shared 는 맨 아래층이다. 위층(shell·areas)을 가져오면 순환이 생긴다.",
    fix: "필요한 값은 함수 인자로 받는다.",
  },
  {
    id: "actions-via-registry",
    files: (f) => /^supabase\/functions\/api\/areas\/.+\.ts$/.test(f),
    test: (src, f) => {
      const out = [];
      if (!/export default \[/.test(src)) out.push("export default [ defineAction(...) ] 없음");
      if (!f.includes("/areas/core/") && /lib\/db\.ts"/.test(src) && /\bdb\(/.test(src)) out.push("db( 직접 호출");
      if (/\.unsafe\(/.test(src)) out.push(".unsafe(");
      return out;
    },
    why: "권한 검사는 defineAction 의 who 선언으로만 한다. 직접 트랜잭션을 열거나 문자열 SQL(unsafe)을 쓰면 권한·주입 검사를 건너뛴다.",
    fix: "defineAction({ name, who: { area, need }, run: ({ tx, ws, access }) => ... }) 로 쓰고, SQL 은 tx`...` 템플릿만 쓴다.",
  },
  {
    id: "no-innerhtml",
    files: (f) => /^web\/src\/.+\.ts$/.test(f),
    bad: /\.innerHTML\s*=|insertAdjacentHTML|unsafeHTML/,
    why: "HTML 문자열을 직접 넣으면 학생 이름 같은 입력값이 코드로 실행될 수 있다.",
    fix: "lit-html 의 html`...` 템플릿으로 그린다(값은 자동으로 안전하게 들어간다).",
  },
  {
    id: "fetch-only-in-api",
    files: (f) => /^web\/src\/.+\.ts$/.test(f) && !/shared\/core\/(api|google)\.ts$/.test(f),
    bad: /\bfetch\(/,
    why: "서버 호출을 여기저기서 하면 로그인 만료·오류 처리·작업공간 붙이기가 빠진다.",
    fix: "shared/core/api.ts 의 api(\"액션\", {...}) 를 쓴다.",
  },
  {
    id: "no-any",
    files: (f) => /^(web\/src|supabase\/functions)\/.+\.ts$/.test(f),
    bad: /:\s*any\b|as any\b|<any>/,
    why: "any 는 타입 검사를 끈다. 서버 응답 모양이 바뀌어도 화면이 조용히 깨진다.",
    fix: "shared/core/types.ts 에 모양을 적거나 unknown 으로 받고 검사한다.",
  },
  {
    id: "no-timer-patch",
    files: (f) => /^web\/src\/.+\.ts$/.test(f) && !/shared\/ui\/ui\.ts$/.test(f),
    bad: /setTimeout\(|setInterval\(/,
    why: "타이머로 순서를 맞추는 땜질은 느린 컴퓨터에서 깨진다.",
    fix: "await 로 순서를 잇거나, 주기 작업은 shared 의 공용 장치로 만든다(만들 때 이 규칙 예외를 그 파일 하나로 둔다).",
  },
  {
    id: "no-excuse-comments",
    files: (f) => /^(web\/src|supabase)\/.+\.(ts|sql)$/.test(f),
    bad: /\b(TODO|FIXME|HACK|XXX)\b|지우지 ?마/,
    why: "할 일 주석은 잊힌다. 지우지 말라는 주석은 이유 없는 코드를 남긴다.",
    fix: "할 일은 docs/feature-map.json 의 status 로 관리하고, 남겨야 할 코드는 시험으로 지킨다.",
  },
  {
    id: "max-400-lines",
    files: (f) => /^(web\/src|supabase\/functions)\/.+\.ts$/.test(f),
    test: (src) => (src.split("\n").length > 400 ? [`${src.split("\n").length}줄`] : []),
    why: "400줄 넘는 파일은 한눈에 안 들어와 고칠 때 다른 곳을 깨뜨린다.",
    fix: "탭·기능 단위로 파일을 나눈다(예: areas/scores/mock/input.ts, report.ts).",
  },
  {
    id: "rls-on-every-table",
    files: (f) => /^supabase\/migrations\/.+\.sql$/.test(f),
    test: (src) => {
      const tables = [...src.matchAll(/create table if not exists (\w+)\.(\w+)/g)].map((m) => [m[1], m[2]]);
      return tables
        .filter(([s, t]) => !new RegExp(`array\\[[^\\]]*'${t}'`).test(src) && !src.includes(`alter table ${s}.${t} enable row level security`))
        .map(([s, t]) => `${s}.${t}`);
    },
    why: "보안 규칙(RLS)이 꺼진 표는 공개 키로 읽힐 수 있다.",
    fix: "파일 아래쪽 권한 블록의 foreach 배열에 표 이름을 넣는다.",
  },
];

function check(files, getSrc) {
  const errs = [];
  for (const f of files) {
    for (const r of RULES) {
      if (!r.files(f)) continue;
      const src = getSrc(f);
      const hits = r.test ? r.test(src, f) : src.split("\n").filter((l) => r.bad.test(l) && !/arch-ok/.test(l)).map((l) => l.trim());
      for (const h of hits) errs.push({ rule: r, f, h });
    }
  }
  return errs;
}

function featureMap() {
  const errs = [];
  const fm = JSON.parse(readFileSync(join(ROOT, "docs/feature-map.json"), "utf8"));
  const names = new Set();
  for (const f of walk(join(ROOT, "supabase/functions/api/areas"))) {
    for (const m of readFileSync(f, "utf8").matchAll(/name: "(\w+)"/g)) names.add(m[1]);
  }
  const mapped = new Set(fm.actions.map((a) => a.action));
  for (const n of names) if (!mapped.has(n)) errs.push(`서버 액션 ${n} 이(가) docs/feature-map.json 에 없습니다 → 어떤 옛 기능을 대신하는지(from) 적어 주세요. 새 기능이면 from: ["새 기능"].`);
  for (const a of fm.actions) if (!names.has(a.action)) errs.push(`feature-map.json 의 ${a.action} 은(는) 서버에 없습니다 → 지웠으면 표에서도 지우세요.`);
  for (const o of fm.legacy) if (!o.to || !o.status) errs.push(`옛 기능 "${o.site} ${o.feature}" 에 to·status 가 없습니다 → 옮길 영역과 상태(예정/완료)를 적으세요.`);
  return errs;
}

if (process.argv.includes("--self")) {
  const dir = join(ROOT, "tools/arch-samples");
  let bad = 0;
  const list = readdirSync(dir);
  for (const f of list) {
    const src = readFileSync(join(dir, f), "utf8");
    const target = src.match(/^(?:\/\/|--) as: (\S+)/m)?.[1];
    const want = f.split(".")[0];
    const got = check([target], () => src).map((e) => e.rule.id);
    if (!got.includes(want)) { console.error(`표본 ${f}: 규칙 ${want} 이(가) 잡지 못함`); bad++; }
  }
  console.log(bad ? `표본 검사 실패 ${bad}건` : `위반 표본 ${list.length}개 모두 걸림`);
  process.exit(bad ? 1 : 0);
}

const files = walk(ROOT).map(rel).filter((f) => !/^(node_modules|dist|\.git|test-results|playwright-report|tools\/arch-samples)\//.test(f));
const errs = check(files, (f) => readFileSync(join(ROOT, f), "utf8"));
const fmErrs = featureMap();
for (const e of errs) console.error(`✗ [${e.rule.id}] ${e.f}\n    ${e.h}\n    왜: ${e.rule.why}\n    고치기: ${e.rule.fix}\n`);
for (const e of fmErrs) console.error(`✗ [feature-map] ${e}`);
if (errs.length + fmErrs.length) { console.error(`구조 검사 실패 ${errs.length + fmErrs.length}건`); process.exit(1); }
console.log("구조 검사 통과");
