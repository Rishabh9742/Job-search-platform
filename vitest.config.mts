import { defineConfig } from "vitest/config";
import path from "node:path";
import os from "node:os";

/** Tests run against an isolated Postgres schema and a temp storage dir. No real submissions. */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(process.cwd(), "src"), "server-only": path.resolve(process.cwd(), "tests/helpers/server-only.ts") } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/helpers/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    env: {
      DATABASE_URL: "postgresql://jobpilot:jobpilot@localhost:5433/jobpilot?schema=jobpilot_test",
      REDIS_URL: "redis://localhost:6380",
      ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      STORAGE_DIR: path.join(os.tmpdir(), "jobpilot-test-storage"),
      AI_PROVIDER: "none",
      APP_URL: "http://localhost:3999",
      NODE_ENV: "test",
    },
  },
});
