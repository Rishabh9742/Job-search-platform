import { execSync } from "node:child_process";

/**
 * Apply migrations to the isolated `jobpilot_test` schema (non-destructive;
 * creates the schema on first run). Tests use unique identities per run, so
 * no reset is required.
 */
export default function setup() {
  execSync("npx prisma migrate deploy", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: "postgresql://jobpilot:jobpilot@localhost:5433/jobpilot?schema=jobpilot_test" },
  });
}
