# W-HUB · 입시관리 통합 플랫폼

와이즈만·연세국제의 입시 관리 도구를 **한 번의 구글 로그인**으로 쓰는 내부 플랫폼입니다.
주소(예정): https://ai-aca.github.io/w-hub/

> 기존 사이트(wmock · wnaesin · School-Record · 2028win · 2027SCI · YSIE · YONSEI)와 그 Supabase·GitHub는 **건드리지 않습니다.**
> W-HUB는 새 저장소와, School Record Supabase 안의 **새 영역(core 스키마·platform 함수)** 에서만 동작합니다. 기존 표·함수·Secrets는 바꾸지 않습니다. 학생에게 나간 기존 링크는 바뀌지 않습니다.

## 구조

```
web/                      화면 (Vite + TypeScript + lit-html, 밝은 테마)
  src/main.ts             진입점: 로그인 확인 → 상단바 + 화면
  src/app/                상태·주소(해시 라우터)·화면(views)
  src/core/               서버 호출, 구글 로그인, 공용 타입·도구, 모듈 정보
  src/styles/app.css      디자인(모듈 강조색은 --accent)
supabase/
  migrations/0001_core.sql  core 스키마: 작업공간·모듈·센터·사용자·권한·세션·로그
  functions/platform/       서버 함수(게이트웨이). 모든 요청은 POST { action, token, ... }
tests/
  server/                 서버 함수 통합 시험(가짜 구글 서명 토큰 사용)
  e2e/                    화면 시험(Playwright)
  local/                  로컬 Postgres·시험 서버 실행 도구
.github/workflows/        검사 → 통과 시 GitHub Pages 배포
```

## 작업공간과 권한

- **작업공간**: 와이즈만(주말반 · 모의고사 · 내신 · 생기부 진단) / 연세국제(온라인 진단 · 외고·국제고 · 내신)
- **원장**: 두 작업공간 전체 + 계정 관리. 상단에 작업공간 전환 버튼이 보입니다.
- **그 외 계정**: 작업공간 × 모듈마다 `관리자 / 입력자 / 열람` 중 하나, 센터별 모듈(내신·생기부)은 센터 범위(전체 또는 선택).
  권한이 있는 작업공간만 보입니다. 하나뿐이면 전환 버튼이 없습니다.
- 내신은 코드·DB 한 벌이고, 두 작업공간에서 각자 범위로 보입니다.
- 모든 검사는 서버가 합니다(화면에서 숨기는 것은 보조).

## 보안 원칙

- 구글 ID 토큰은 서버에서 **서명·발급자·대상(클라이언트 ID)·만료·이메일 인증**까지 확인합니다.
- 세션 토큰은 DB에 해시만 저장(기본 14일). 차단·승인 취소 시 즉시 끊깁니다.
- core 표는 Data API에 노출하지 않고, 함수는 `core_app` 역할로 권한을 낮춰 접근합니다.
- 원장 이메일·허용 출처·구글 클라이언트 ID는 core.settings 에 둡니다(공개 저장소에 적지 않음). 프로젝트 Secrets는 건드리지 않습니다.
- 같은 IP 10분 20회 로그인 실패 시 잠시 차단. 허용 출처(ALLOWED_ORIGINS) 외 요청 거부.

## 로컬에서 실행

```bash
npm ci
tests/local/db_up.sh                                  # Postgres :5433 + 마이그레이션
(cd tests/local && npx deno run -A serve.ts &)        # 가짜 구글 + 서버 함수 :8000
WHUB_BASE=/ VITE_API_URL=http://localhost:8000/platform npm run dev
npm run test:server   # 서버 시험(시험 서버는 끈 상태에서)
npm run test:e2e      # 화면 시험
```

배포 절차는 `docs/배포_안내.md`를 보세요.
