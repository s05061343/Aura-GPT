import { z } from "zod";

const boolString = z.enum(["true", "false"]).transform((value) => value === "true");

const envSchema = z.object({
  LLAMA_SERVER_URL: z.string().url().default("http://127.0.0.1:8080/v1"),
  LLM_MODEL_ALIAS: z.string().min(1).default("aura-local"),
  LLM_MODEL_DISPLAY_NAME: z.string().min(1).default("Qwen3 8B"),
  AGENT_MAX_STEPS: z.coerce.number().int().min(1).max(8).default(5),
  AGENT_MAX_TOOL_CALLS: z.coerce.number().int().min(1).max(8).default(4),
  TOOL_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(15_000),
  SESSION_TTL_MS: z.coerce.number().int().min(60_000).max(86_400_000).default(1_800_000),
  LANGSMITH_TRACING: boolString.default(true),
  LANGSMITH_API_KEY: z.string().optional(),
  LANGSMITH_PROJECT: z.string().default("aura-gpt-local"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type AuraConfig = z.infer<typeof envSchema> & { langSmithEnabled: boolean };

let cached: AuraConfig | undefined;

export function getConfig(): AuraConfig {
  if (cached) return cached;
  const parsed = envSchema.parse(process.env);
  const langSmithEnabled = parsed.LANGSMITH_TRACING && Boolean(parsed.LANGSMITH_API_KEY);
  process.env.LANGSMITH_TRACING = langSmithEnabled ? "true" : "false";
  process.env.LANGSMITH_PROJECT = parsed.LANGSMITH_PROJECT;
  cached = { ...parsed, langSmithEnabled };
  return cached;
}

export function resetConfigForTests(): void {
  cached = undefined;
}
