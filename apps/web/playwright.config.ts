import { defineConfig } from "@playwright/test";

// The smoke test needs both servers. `make e2e` starts them via webServer below.
export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:5173" },
  webServer: [
    {
      command: "uv run uvicorn spectre.main:app --port 8000",
      env: { SPECTRE_DATABASE_URL: "sqlite:////tmp/spectre-e2e.db" },
      cwd: "../api",
      url: "http://localhost:8000/api/v1/health",
      reuseExistingServer: true,
    },
    {
      command: "npm run dev",
      url: "http://localhost:5173",
      reuseExistingServer: true,
    },
  ],
});
