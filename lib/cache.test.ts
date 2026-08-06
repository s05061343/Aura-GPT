import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryCache } from "@/lib/cache";

describe("MemoryCache", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("在 TTL 內命中，過期後移除", () => {
    const cache = new MemoryCache<number>(1_000);
    cache.set("answer", 42);
    expect(cache.get("answer")).toBe(42);
    vi.advanceTimersByTime(1_001);
    expect(cache.get("answer")).toBeUndefined();
  });
});
