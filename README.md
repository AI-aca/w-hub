# W-HUB · 와이즈만·연세국제 선생님용 통합 사이트

주소: https://ai-aca.github.io/w-hub/ · 구글 로그인 한 번 · 기준 문서: [docs/계획서.md](docs/계획서.md)

- **새 저장소 + 새 Supabase 프로젝트.** 기존 사이트 7개와 기존 DB 는 보존(읽기만). 자료는 복사해서 새 구조로 재정리.
- 구글은 로그인에만 씁니다. 드라이브·시트·문서·GAS 저장 없음.
- 와이즈만 학생과 연세국제 학생은 섞이지 않습니다(표마다 작업공간, 서버가 강제).

## 구조

```
web/src/
  main.ts                 시작: 로그인 확인 → 뼈대 → 주소(#/작업공간/메뉴/…)에 맞는 화면
  shell/                  상단(작업공간 전환·메뉴) + 왼쪽 3구역 + 작업 영역, 로그인 화면
  shared/core             서버 호출(api), 구글 로그인, 주소, 메뉴, 타입
  shared/ui               알림·대화상자·목록 표 (영역 화면은 이것만 씀)
  areas/                  home · students · admin  (이후 scores · class · admission · analysis · bank · calendar)
supabase/
  migrations/             0001_core(계정·권한) · 0002_org(센터·학교·강사) · 0003_people(학생)
  functions/api/          handler · lib/registry(defineAction: 권한 선언) · areas/*/actions.ts
docs/feature-map.json     옛 사이트 기능 전부 ↔ 새 기능 대응(구조 검사가 대조)
tools/arch-check.mjs      구조 검사(위반 시 왜·고치기 안내) + arch-samples(위반 표본)
tools/verify.sh           검증 명령 하나(타입·구조·서버·화면 시험 + 캡처)
tests/                    server · e2e · local(시험용 Postgres :5433, 가짜 구글)
```

## 권한

계정마다 **작업공간 × 영역 × 단계(열람·입력·관리) × 센터**. 한 선생님이 여러 영역을 가질 수 있습니다.
원장은 전부 + 관리 메뉴. 메뉴는 권한이 있고 옮겨 온 영역만 보입니다.

## 개발

```
bash tests/local/db_up.sh     # 시험용 Postgres
npm run verify                # 전부 검사 + 캡처(test-results/shots)
```
