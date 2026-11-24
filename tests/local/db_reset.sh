#!/usr/bin/env bash
# 시험 DB 비우고 마이그레이션 다시 적용(두 번 적용해 반복 실행 안전성도 확인)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export PGOPTIONS="-c client_min_messages=warning"
P="psql -q -v ON_ERROR_STOP=1 -h ${PGHOST:-/tmp} -p ${PGPORT:-5433} -U postgres"
$P -c "drop schema if exists calendar, class, people, org, core cascade;" >/dev/null
for i in 1 2; do for f in "$ROOT"/supabase/migrations/*.sql; do $P -f "$f" 2>&1 | grep -v NOTICE || true; done; done
