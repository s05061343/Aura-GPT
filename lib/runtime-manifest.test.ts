import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type RuntimeManifest = {
  llamaCpp: {
    defaultBackend: string;
    fallbackBackend: string;
    backends: Record<string, { assets: string[] }>;
  };
};

const manifest = JSON.parse(
  readFileSync(new URL("../runtime-manifest.json", import.meta.url), "utf8"),
) as RuntimeManifest;
const startScript = readFileSync(
  new URL("../scripts/start.ps1", import.meta.url),
  "utf8",
);
const runScript = readFileSync(
  new URL("../scripts/run.ps1", import.meta.url),
  "utf8",
);
const runBatch = readFileSync(new URL("../run.bat", import.meta.url), "utf8");

describe("runtime manifest", () => {
  it("uses HIP by default and Vulkan as the fallback", () => {
    expect(manifest.llamaCpp.defaultBackend).toBe("hip");
    expect(manifest.llamaCpp.fallbackBackend).toBe("vulkan");
  });

  it("pins isolated AMD runtime assets without CUDA", () => {
    expect(manifest.llamaCpp.backends.hip.assets).toEqual([
      "llama-b9637-bin-win-hip-radeon-x64.zip",
    ]);
    expect(manifest.llamaCpp.backends.vulkan.assets).toEqual([
      "llama-b9637-bin-win-vulkan-x64.zip",
    ]);
    expect(JSON.stringify(manifest.llamaCpp)).not.toMatch(/cuda|nvidia/i);
  });

  it("only falls back after an automatic HIP startup failure", () => {
    expect(startScript).toContain("$requestedBackend -eq 'auto'");
    expect(startScript).toContain("$manifest.llamaCpp.defaultBackend");
    expect(startScript).toContain("$manifest.llamaCpp.fallbackBackend");
    expect(startScript).toContain("Stop-Process -Id $candidate.Id -Force");
    expect(startScript).toContain("if ($requestedBackend -ne 'auto') { throw }");
  });

  it("keeps one-click startup tied to a verified manifest marker", () => {
    expect(runScript).toContain(".runtime\\setup-complete.json");
    expect(runScript).toContain("manifestSha256");
    expect(runScript).toContain("setup-runtime.ps1");
    expect(runScript).toContain("Node.js 24 or newer is required");
    expect(runBatch).toContain("-ExecutionPolicy Bypass");
    expect(runBatch).toContain("scripts\\run.ps1");
  });
});
