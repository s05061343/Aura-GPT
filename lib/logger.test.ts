import { afterEach, describe, expect, it, vi } from "vitest";
import { logEvent } from "@/lib/logger";

describe("結構化日誌", () => {
  afterEach(() => vi.restoreAllMocks());

  it("遮蔽巢狀秘密", () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    logEvent("test", { apiKey: "secret", nested: { authorization: "Bearer secret", duration: 12 } });
    const output = String(write.mock.calls[0][0]);
    expect(output).not.toContain("Bearer secret");
    expect(output).not.toContain('"secret"');
    expect(output).toContain("[REDACTED]");
    expect(output).toContain('"duration":12');
  });
});
