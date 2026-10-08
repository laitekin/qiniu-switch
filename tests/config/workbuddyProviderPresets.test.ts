import { describe, expect, it } from "vitest";
import { workbuddyProviderPresets } from "@/config/workbuddyProviderPresets";
import { opencodeProviderPresets } from "@/config/opencodeProviderPresets";

describe("WorkBuddy presets", () => {
  it("includes Qiniu and carries model capabilities without SDK-only options", () => {
    const qiniu = workbuddyProviderPresets.find((p) => p.name === "Qiniu")!;
    expect(qiniu).toBeDefined();
    expect(qiniu.icon).toBe("qiniu");
    expect(qiniu.settingsConfig.options).toEqual({
      baseURL: "https://api.qnaigc.com/v1",
      apiKey: "",
    });
    const source = opencodeProviderPresets.find((p) => p.name === "Qiniu")!;
    expect(Object.keys(qiniu.settingsConfig.models)).toEqual(
      Object.keys(source.settingsConfig.models),
    );
    expect(
      qiniu.settingsConfig.models["gpt-6-astra"].options?.supportsImages,
    ).toBe(true);
  });

  it("only offers existing Chat Completions endpoints and excludes custom headers", () => {
    expect(workbuddyProviderPresets.length).toBeGreaterThan(1);
    for (const preset of workbuddyProviderPresets) {
      const source = opencodeProviderPresets.find(
        (p) => p.name === preset.name,
      )!;
      expect(source.settingsConfig.npm).toBe("@ai-sdk/openai-compatible");
      expect(
        Object.keys(source.settingsConfig.options.headers ?? {}),
      ).toHaveLength(0);
      expect(preset.settingsConfig.api).toBe("openai-completions");
      expect(preset.settingsConfig.options.apiKey).toBe("");
    }
  });
});
