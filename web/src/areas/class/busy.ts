// 저장 중에 창을 닫으려 하면 경고(옛 학원 평가 사이트에 있던 '저장 중 창 닫기 경고'). 서버로 저장하는 호출을 track 으로 감싼다.
let n = 0, on = false;
const guard = (e: BeforeUnloadEvent) => { if (n > 0) { e.preventDefault(); e.returnValue = ""; } };

export async function track<T>(p: Promise<T>): Promise<T> {
  if (!on) { addEventListener("beforeunload", guard); on = true; }
  n++;
  try { return await p; } finally { n--; }
}
export const saving = () => n > 0;

/** 같은 줄(key)의 저장은 차례로: 앞 저장이 끝나 새 버전 번호를 받은 뒤 다음 저장을 보낸다(빠르게 두 번 고쳐도 '먼저 고쳤습니다'로 거절되지 않게). */
const lines = new Map<string, Promise<unknown>>();
export function inOrder(key: string, run: () => Promise<unknown>): Promise<unknown> {
  const p = (lines.get(key) ?? Promise.resolve()).then(run, run);
  lines.set(key, p);
  void p.finally(() => { if (lines.get(key) === p) lines.delete(key); });
  return track(p);
}
