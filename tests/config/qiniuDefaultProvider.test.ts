import { describe, expect, it } from "vitest";
import {
  getQiniuDefaultProvider,
  needsQiniuApiKey,
} from "@/config/qiniuDefaultProvider";
import { workbuddyProviderPresets } from "@/config/workbuddyProviderPresets";
import { claudeDesktopProviderPresets } from "@/config/claudeDesktopProviderPresets";

describe("Qiniu default provider", () => {
  it.each([
    "claude",
    "claude-desktop",
    "codex",
    "gemini",
    "opencode",
    "pi",
    "mcode",
    "workbuddy",
  ] as const)("provides an unconfigured, independent preset for %s", (app) => {
    const provider = getQiniuDefaultProvider(app)!;
    expect(provider.icon).toBe("qiniu");
    expect(needsQiniuApiKey(provider)).toBe(true);
    provider.settingsConfig = {};
    expect(getQiniuDefaultProvider(app)?.settingsConfig).not.toEqual({});
  });

  it("preserves WorkBuddy model metadata and Claude Desktop route mappings", () => {
    const workbuddy = getQiniuDefaultProvider("workbuddy")!;
    const preset = workbuddyProviderPresets.find((p) => p.icon === "qiniu")!;
    expect(workbuddy.settingsConfig.models).toEqual(
      preset.settingsConfig.models,
    );
    workbuddy.settingsConfig.options.apiKey = "test-key";
    expect(needsQiniuApiKey(workbuddy)).toBe(false);
    expect(preset.settingsConfig.options.apiKey).toBe("");
    const desktop = getQiniuDefaultProvider("claude-desktop")!;
    for (const route of claudeDesktopProviderPresets.find(
      (p) => p.icon === "qiniu",
    )!.modelRoutes!) {
      expect(
        desktop.meta?.claudeDesktopModelRoutes?.[route.routeId].model,
      ).toBe(route.upstreamModel);
    }
    desktop.settingsConfig.env.ANTHROPIC_API_KEY = "test-key";
    expect(needsQiniuApiKey(desktop)).toBe(false);
  });

  it("does not invent presets for apps without a Qiniu template", () => {
    expect(getQiniuDefaultProvider("hermes")).toBeUndefined();
    expect(getQiniuDefaultProvider("grokbuild")).toBeUndefined();
    expect(getQiniuDefaultProvider("openclaw")).toBeUndefined();
  });
});
