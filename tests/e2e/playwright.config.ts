import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  workers: 1,
  use: { baseURL: "http://localhost:5173/", viewport: { width: 1360, height: 860 }, locale: "ko-KR" },
  webServer: {
    command: "WHUB_BASE=/ VITE_API_URL=http://localhost:8000/platform npx vite --config web/vite.config.ts",
    cwd: "../..",
    url: "http://localhost:5173/",
    reuseExistingServer: true,
  },
});
