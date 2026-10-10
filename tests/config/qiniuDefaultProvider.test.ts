import { describe, expect, it } from "vitest";
import {
  getQiniuDefaultProvider,
  needsQiniuApiKey,
} from "@/config/qiniuDefaultProvider";
import { workbuddyProviderPresets } from "@/config/workbuddyProviderPresets";
import { claudeDesktopProviderPresets } from "@/config/claudeDesktopProviderPresets";
import { APP_IDS } from "@/config/appConfig";
import { parseGrokBuildConfig } from "@/utils/grokBuildConfig";

describe("Qiniu default provider", () => {
  it.each(APP_IDS)(
    "provides an unconfigured, independent preset for %s",
    (app) => {
      const provider = getQiniuDefaultProvider(app)!;
      expect(provider.icon).toBe("qiniu");
      expect(needsQiniuApiKey(provider)).toBe(true);
      provider.settingsConfig = {};
      expect(getQiniuDefaultProvider(app)?.settingsConfig).not.toEqual({});
    },
  );

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

  it("prefills each new client's endpoint without an API Key", () => {
    const grok = getQiniuDefaultProvider("grokbuild")!;
    expect(parseGrokBuildConfig(grok.settingsConfig.config).baseUrl).toBe(
      "https://api.qnaigc.com/bypass/openai/v1",
    );
    grok.settingsConfig.config = grok.settingsConfig.config.replace(
      'name = "Qiniu"',
      'name = "Qiniu"\napi_key = "test-key"',
    );
    expect(needsQiniuApiKey(grok)).toBe(false);

    const antigravity = getQiniuDefaultProvider("antigravity")!;
    expect(antigravity.settingsConfig.env.GOOGLE_GEMINI_BASE_URL).toBe(
      "https://api.qnaigc.com/bypass/vertex",
    );
    expect(antigravity.settingsConfig.env.GEMINI_API_KEY).toBe("");

    for (const app of ["openclaw", "hermes", "dsh"] as const) {
      const provider = getQiniuDefaultProvider(app)!;
      const config = provider.settingsConfig;
      expect(config.baseUrl ?? config.base_url ?? config.options?.baseURL).toBe(
        "https://api.qnaigc.com/v1",
      );
    }
    const hermes = getQiniuDefaultProvider("hermes")!;
    hermes.settingsConfig.api_key = "test-key";
    expect(needsQiniuApiKey(hermes)).toBe(false);
  });
});
