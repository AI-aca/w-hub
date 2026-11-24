1. `npm run check` 가 내는 지적을 그대로 따른다. 규칙을 끄거나 예외 주석을 달지 않는다.
2. 기능을 만들기 전에 `docs/feature-map.json` 에서 옛 기능(legacy)을 찾고, 만든 뒤 status 와 actions 를 고친다.
3. 끝났다고 말하기 전에 `npm run verify` 를 돌린다(타입·구조·서버·화면 시험 + 화면 캡처).
4. 캡처(`test-results/shots`)를 직접 열어 보고, 원장님께는 캡처와 쉬운 말 요약만 보고한다.
5. 계획서(docs/계획서.md)에 없는 일, 기존 사이트·기존 DB를 건드리는 일은 하지 않고 멈춰서 보고한다.
