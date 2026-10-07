import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

/**
 * End-to-end tests run against what users get: the static frontend build
 * served by the real FastAPI backend (which needs `uv` on the PATH).
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    timezoneId: "America/New_York",
    locale: "en-US",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && uv run --project ../backend prelegal-backend",
    url: `http://localhost:${PORT}/api/health`,
    env: {
      PRELEGAL_PORT: String(PORT),
      PRELEGAL_STATIC_DIR: path.resolve(__dirname, "out"),
      PRELEGAL_DB_PATH: path.resolve(__dirname, "..", "backend", "data", "e2e.db"),
      // Set but empty, so the repo's .env isn't loaded: tests never call the
      // real LLM, and unmocked chats get the "not configured" error.
      OPENROUTER_API_KEY: "",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
