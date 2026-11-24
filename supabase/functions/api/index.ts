// W-HUB 서버 함수 진입점
import { handle } from "./handler.ts";

Deno.serve(handle);
