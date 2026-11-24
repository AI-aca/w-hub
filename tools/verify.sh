#!/usr/bin/env bash
# 검증 명령 하나: 타입 → 구조 검사 → 서버 시험 → 화면 시험(캡처 저장)
# 로컬 Postgres(:5433)가 없으면 tests/local/db_up.sh 를 먼저 실행한다.
set -euo pipefail
cd "$(dirname "$0")/.."
SHOTS="${SHOTS_DIR:-$PWD/test-results/shots}"
mkdir -p "$SHOTS"
echo "== 1. 타입 검사"; npm run -s typecheck
(cd supabase/functions/api && npx deno check index.ts && npx deno lint -q)
echo "== 2. 구조 검사"; node tools/arch-check.mjs --self && node tools/arch-check.mjs
echo "== 3. 서버 시험"
bash tests/local/db_reset.sh
(cd tests/server && npx deno test -A -q api_test.ts)
bash tests/local/db_reset.sh
(cd tests/server && npx deno test -A -q config_test.ts)
echo "== 4. 화면 시험"
bash tests/local/db_reset.sh
(cd tests/local && nohup npx deno run -A serve.ts > /tmp/whub-serve.log 2>&1 &) 
trap 'pkill -f "deno run -A serve.ts" || true' EXIT
for i in $(seq 1 30); do curl -sf -X POST localhost:8000/api -H 'origin: http://localhost:5173' -d '{"action":"config"}' >/dev/null && break; sleep 1; done
SHOTS_DIR="$SHOTS" npx playwright test -c tests/e2e/playwright.config.ts
echo "== 통과. 캡처: $SHOTS"
