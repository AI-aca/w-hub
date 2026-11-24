// 옮겨 오기 작업 목록. 새 작업은 파일 하나 만들고 여기에 더한다.
import type { Job } from "../lib.ts";
import mockUsers from "./mock_users.ts";
import weiz2028 from "./weiz2028.ts";

export const JOBS: Job[] = [mockUsers, weiz2028];
