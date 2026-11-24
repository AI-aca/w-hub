// 지금 보고 있는 작업공간(와이즈만/연세국제). 서버 요청에 자동으로 붙는다.
let ws = "";
export const currentWs = () => ws;
export const setCurrentWs = (v: string) => { ws = v; };
