import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod/v4";
import { aiEnabled, env } from "@/lib/env";

let client: Anthropic | null = null;

function getClient() {
  if (!client) client = new Anthropic({ apiKey: env().ANTHROPIC_API_KEY, maxRetries: 3 });
  return client;
}

export class AiUnavailableError extends Error {}
export class AiRefusalError extends Error {}

export const aiModelName = () => (aiEnabled() ? env().AI_MODEL : "rule-based");

/**
 * One structured-output call. Uses server-side refusal fallbacks ("default")
 * so a policy decline is retried on the platform's fallback model.
 */
export async function structured<T extends z.ZodType>(opts: {
  system: string;
  user: string;
  schema: T;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<z.infer<T>> {
  if (!aiEnabled()) throw new AiUnavailableError("AI provider not configured");
  const res = await getClient().beta.messages.parse({
    model: env().AI_MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: opts.effort ?? "medium", format: betaZodOutputFormat(opts.schema) },
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });
  if (res.stop_reason === "refusal") throw new AiRefusalError("The AI provider declined this request");
  if (res.stop_reason === "max_tokens") throw new Error("AI response truncated (max_tokens)");
  if (res.parsed_output == null) throw new Error("AI response did not match the expected schema");
  return res.parsed_output as z.infer<T>;
}
