#!/usr/bin/env bash
# 로컬 시험용 Postgres(:5433) — 새로 만들고 마이그레이션 적용
set -euo pipefail
PG=/usr/lib/postgresql/16/bin
DIR=/var/tmp/whub-pg
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
su postgres -c "$PG/pg_ctl -D $DIR stop -m fast" >/dev/null 2>&1 || true
rm -rf "$DIR"; mkdir -p "$DIR"; chown postgres "$DIR"
su postgres -c "$PG/initdb -D $DIR -U postgres --auth=trust -E UTF8 --locale=C.UTF-8" >/dev/null
su postgres -c "$PG/pg_ctl -D $DIR -o '-p 5433 -k /tmp' -l $DIR/log start -w" >/dev/null
psql -h /tmp -p 5433 -U postgres -q -v ON_ERROR_STOP=1 -c "create role anon nologin; create role authenticated nologin;"
for f in "$ROOT"/supabase/migrations/*.sql; do psql -h /tmp -p 5433 -U postgres -q -v ON_ERROR_STOP=1 -f "$f"; done
echo "db ready :5433"
