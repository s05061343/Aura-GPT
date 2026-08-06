export async function fetchJson(url: string, timeoutMs: number, signal?: AbortSignal): Promise<unknown> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const response = await fetch(url, {
    signal: combined,
    headers: { Accept: "application/json", "User-Agent": "Aura-GPT/0.1" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Upstream request failed with ${response.status}`);
  return response.json();
}
