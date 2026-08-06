const SECRET_KEYS = /api[-_]?key|authorization|token|secret|password/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, SECRET_KEYS.test(key) ? "[REDACTED]" : redact(child)]),
    );
  }
  return value;
}

export function logEvent(event: string, fields: Record<string, unknown> = {}): void {
  const safeFields = redact(fields) as Record<string, unknown>;
  process.stdout.write(`${JSON.stringify({ timestamp: new Date().toISOString(), event, ...safeFields })}\n`);
}
