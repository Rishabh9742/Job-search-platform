import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  APP_URL: z.string().default("http://localhost:3000"),
  ENCRYPTION_KEY: z.string().default(""),
  STORAGE_DIR: z.string().default("./storage"),
  AI_PROVIDER: z.enum(["anthropic", "none"]).default("anthropic"),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("claude-opus-5-5"),
  ADZUNA_APP_ID: z.string().optional(),
  ADZUNA_APP_KEY: z.string().optional(),
  USAJOBS_API_KEY: z.string().optional(),
  USAJOBS_USER_AGENT_EMAIL: z.string().optional(),
  GREENHOUSE_BOARDS: z.string().optional(),
  LEVER_SITES: z.string().optional(),
  ASHBY_BOARDS: z.string().optional(),
  MOCK_MODE: z.string().optional(),
  SUBMISSION_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(2),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}

export const isMockMode = () => env().MOCK_MODE === "true";

export const aiEnabled = () => env().AI_PROVIDER === "anthropic" && !!env().ANTHROPIC_API_KEY;

export const csv = (v: string | undefined) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
