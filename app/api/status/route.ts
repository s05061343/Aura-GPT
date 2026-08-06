import { getConfig } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const config = getConfig();
  let modelReady = false;
  try {
    const response = await fetch(`${config.LLAMA_SERVER_URL}/models`, { signal: AbortSignal.timeout(2_000), cache: "no-store" });
    modelReady = response.ok;
  } catch { /* server is offline */ }
  return Response.json({
    application: "ready",
    model: modelReady ? "ready" : "unavailable",
    modelAlias: config.LLM_MODEL_ALIAS,
    langSmith: config.langSmithEnabled ? "enabled" : "local-fallback",
  });
}
