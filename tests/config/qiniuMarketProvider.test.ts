import { describe, expect, it } from "vitest";
import { parse as parseToml } from "smol-toml";
import { APP_IDS } from "@/config/appConfig";
import { CLAUDE_DESKTOP_ROLE_ROUTE_IDS } from "@/config/claudeDesktopProviderPresets";
import type { AppId } from "@/lib/api/types";
import type { QiniuMarketModel } from "@/lib/api/qiniuMarket";
import {
  buildQiniuMarketProvider,
  marketModelSupportsApp,
} from "@/utils/qiniuMarketProvider";

const KEY = "sk-market-unit-test-only";
const VERIFIED_MODEL_ID = "verified-model-alias";
const PROVIDER_ID = "market-unit-provider";
const model: QiniuMarketModel = {
  id: "vendor/catalog-model-id",
  apiIds: ["vendor/catalog-model-id", VERIFIED_MODEL_ID],
  name: "Selected model",
  vendor: "Test vendor",
  capabilities: ["工具调用"],
  protocols: ["openai-chat", "anthropic-messages"],
  inputModalities: ["text", "image"],
  outputModalities: ["text"],
  prices: [],
  contextWindow: "1M",
  maxOutput: "128K",
  supportsChat: true,
  available: true,
  retired: false,
};

function build(app: AppId, overrides: Partial<QiniuMarketModel> = {}) {
  return buildQiniuMarketProvider(
    { ...model, ...overrides },
    VERIFIED_MODEL_ID,
    app,
    ` ${KEY} `,
    PROVIDER_ID,
  );
}

describe("Qiniu marketplace client configuration", () => {
  it.each(APP_IDS.filter((app) => app !== "gemini" && app !== "antigravity"))(
    "%s preserves the verified model and key without unrelated preset models",
    (app) => {
      const provider = build(app);
      expect(provider).toMatchObject({
        id: PROVIDER_ID,
        name: "七牛云 · Selected model",
        category: "aggregator",
        icon: "qiniu",
        websiteUrl: "https://www.qiniu.com",
      });
      const config = JSON.stringify(provider.settingsConfig);
      expect(config).toContain(VERIFIED_MODEL_ID);
      expect(config).toContain(KEY);
      expect(config).not.toContain(model.id);
      expect(config).not.toContain("gpt-5.6-sol");
      expect(config).not.toContain("grok-4.5");
    },
  );

  it("writes the selected model to every Claude Code role", () => {
    const provider = build("claude");
    expect(provider.settingsConfig).toEqual({
      env: {
        ANTHROPIC_BASE_URL: "https://api.qnaigc.com",
        ANTHROPIC_AUTH_TOKEN: KEY,
        ANTHROPIC_MODEL: VERIFIED_MODEL_ID,
        ANTHROPIC_DEFAULT_SONNET_MODEL: VERIFIED_MODEL_ID,
        ANTHROPIC_DEFAULT_OPUS_MODEL: VERIFIED_MODEL_ID,
        ANTHROPIC_DEFAULT_HAIKU_MODEL: VERIFIED_MODEL_ID,
      },
    });
    expect(provider.meta?.apiFormat).toBe("anthropic");
  });

  it("maps Claude Desktop roles to one upstream model through its existing proxy", () => {
    const provider = build("claude-desktop", { protocols: ["openai-chat"] });
    expect(provider.meta?.claudeDesktopMode).toBe("proxy");
    expect(provider.meta?.apiFormat).toBe("openai_chat");
    expect(provider.settingsConfig.env.ANTHROPIC_BASE_URL).toBe(
      "https://api.qnaigc.com/v1",
    );
    const routes = provider.meta?.claudeDesktopModelRoutes;
    expect(Object.keys(routes ?? {})).toEqual([
      CLAUDE_DESKTOP_ROLE_ROUTE_IDS.sonnet,
      CLAUDE_DESKTOP_ROLE_ROUTE_IDS.opus,
      CLAUDE_DESKTOP_ROLE_ROUTE_IDS.haiku,
    ]);
    for (const route of Object.values(routes ?? {})) {
      expect(route.model).toBe(VERIFIED_MODEL_ID);
      expect(route.labelOverride).toBe(model.name);
    }
  });

  it("writes valid Codex TOML and a catalog containing only the selected model", () => {
    const provider = build("codex");
    const config = parseToml(provider.settingsConfig.config);
    expect(config.model).toBe(VERIFIED_MODEL_ID);
    expect(config.model_providers).toMatchObject({
      custom: {
        name: "Qiniu",
        base_url: "https://api.qnaigc.com/v1",
      },
    });
    expect(provider.meta?.apiFormat).toBe("openai_chat");
    expect(provider.settingsConfig.auth).toEqual({ OPENAI_API_KEY: KEY });
    expect(provider.settingsConfig.modelCatalog.models).toEqual([
      {
        model: VERIFIED_MODEL_ID,
        displayName: model.name,
        contextWindow: 1_000_000,
        inputModalities: ["text", "image"],
      },
    ]);
  });

  it("writes one Grok Build profile with the selected upstream model", () => {
    const provider = build("grokbuild");
    const config = parseToml(provider.settingsConfig.config);
    expect(config.models).toEqual({ default: VERIFIED_MODEL_ID });
    expect(config.model).toEqual({
      [VERIFIED_MODEL_ID]: {
        model: VERIFIED_MODEL_ID,
        base_url: "https://api.qnaigc.com/v1",
        name: "Qiniu",
        api_backend: "chat_completions",
        context_window: 1_000_000,
        api_key: KEY,
      },
    });
  });

  it.each(["opencode", "mcode", "workbuddy", "dsh"] as const)(
    "%s has one model map entry and retains advertised limits",
    (app) => {
      const config = build(app).settingsConfig;
      expect(Object.keys(config.models)).toEqual([VERIFIED_MODEL_ID]);
      expect(config.models[VERIFIED_MODEL_ID]).toMatchObject({
        name: model.name,
        limit: { context: 1_000_000, output: 128_000 },
        modalities: { input: ["text", "image"], output: ["text"] },
      });
      expect(config.options).toEqual({
        baseURL: "https://api.qnaigc.com/v1",
        apiKey: KEY,
      });
      if (app === "opencode") {
        expect(config.npm).toBe("@ai-sdk/openai-compatible");
      } else {
        expect(config.api).toBe("openai-completions");
        expect(config.vendor).toBe("Qiniu");
      }
      if (app === "workbuddy") {
        expect(config.models[VERIFIED_MODEL_ID].options).toEqual({
          supportsImages: true,
          supportsToolCall: true,
        });
      }
    },
  );

  it.each(["openclaw", "pi"] as const)(
    "%s receives one native model descriptor",
    (app) => {
      const config = build(app).settingsConfig;
      expect(config).toMatchObject({
        baseUrl: "https://api.qnaigc.com/v1",
        apiKey: KEY,
        api: "openai-completions",
      });
      expect(config.models).toEqual([
        {
          id: VERIFIED_MODEL_ID,
          name: model.name,
          contextWindow: 1_000_000,
          maxTokens: 128_000,
          input: ["text", "image"],
        },
      ]);
    },
  );

  it("uses Hermes field names and a single selected model", () => {
    expect(build("hermes").settingsConfig).toEqual({
      name: PROVIDER_ID,
      base_url: "https://api.qnaigc.com/v1",
      api_key: KEY,
      api_mode: "chat_completions",
      models: [
        {
          id: VERIFIED_MODEL_ID,
          name: model.name,
          context_length: 1_000_000,
        },
      ],
    });
  });

  it("supports Anthropic-only client configuration without requiring chat support", () => {
    const anthropic: QiniuMarketModel = {
      ...model,
      protocols: ["anthropic-messages"],
      supportsChat: false,
    };
    for (const app of APP_IDS.filter(
      (item) =>
        item !== "workbuddy" &&
        item !== "dsh" &&
        item !== "gemini" &&
        item !== "antigravity",
    )) {
      expect(marketModelSupportsApp(anthropic, app)).toBe(true);
      expect(() => build(app, anthropic)).not.toThrow();
    }
    expect(marketModelSupportsApp(anthropic, "workbuddy")).toBe(false);
    expect(build("opencode", anthropic).settingsConfig).toMatchObject({
      npm: "@ai-sdk/anthropic",
      options: { baseURL: "https://api.qnaigc.com/v1", apiKey: KEY },
    });
    for (const app of ["mcode", "openclaw", "pi"] as const) {
      expect(build(app, anthropic).settingsConfig.api).toBe(
        "anthropic-messages",
      );
    }
    expect(build("hermes", anthropic).settingsConfig.api_mode).toBe(
      "anthropic_messages",
    );
    for (const app of [
      "claude",
      "claude-desktop",
      "codex",
      "grokbuild",
    ] as const) {
      expect(build(app, anthropic).meta?.apiFormat).toBe("anthropic");
    }
  });

  it("does not send OpenAI or Anthropic models to native Gemini", () => {
    expect(marketModelSupportsApp(model, "gemini")).toBe(false);
    expect(() => build("gemini")).toThrow("MARKET_CONFIG_INVALID");
    expect(marketModelSupportsApp(model, "antigravity")).toBe(false);
    expect(() => build("antigravity")).toThrow("MARKET_CONFIG_INVALID");
  });

  it.each(["vertex-bypass", "gemini-native"])(
    "accepts explicitly advertised %s for Gemini",
    (protocol) => {
      const gemini = {
        ...model,
        protocols: [protocol],
        supportsChat: false,
      };
      expect(marketModelSupportsApp(gemini, "gemini")).toBe(true);
      expect(marketModelSupportsApp(gemini, "antigravity")).toBe(true);
      expect(build("gemini", gemini).settingsConfig).toEqual({
        env: {
          GOOGLE_GEMINI_BASE_URL: "https://api.qnaigc.com/bypass/vertex",
          GEMINI_API_KEY: KEY,
          GEMINI_MODEL: VERIFIED_MODEL_ID,
        },
      });
    },
  );

  it.each([
    ["media", { outputModalities: ["video"] }],
    ["retired", { retired: true }],
    ["private or unavailable", { available: false }],
    ["unknown protocol", { protocols: ["unsupported-format"] }],
  ] satisfies [string, Partial<QiniuMarketModel>][])(
    "rejects %s models for every client",
    (_reason, overrides) => {
      for (const app of APP_IDS) {
        expect(marketModelSupportsApp({ ...model, ...overrides }, app)).toBe(
          false,
        );
        expect(() => build(app, overrides)).toThrow("MARKET_CONFIG_INVALID");
      }
    },
  );

  it("does not infer missing capacities or tool support from names", () => {
    const config = build("workbuddy", {
      name: "Huge-999M-tool-model",
      contextWindow: undefined,
      maxOutput: "unknown",
      capabilities: [],
      inputModalities: ["text"],
    }).settingsConfig;
    expect(config.models[VERIFIED_MODEL_ID].limit).toBeUndefined();
    expect(config.models[VERIFIED_MODEL_ID].options).toEqual({
      supportsImages: false,
      supportsToolCall: false,
    });
  });

  it.each([
    ["", KEY, PROVIDER_ID],
    ["   ", KEY, PROVIDER_ID],
    [VERIFIED_MODEL_ID, " ", PROVIDER_ID],
    [VERIFIED_MODEL_ID, KEY, ""],
  ])("rejects incomplete verified inputs", (modelId, apiKey, id) => {
    expect(() =>
      buildQiniuMarketProvider(model, modelId, "workbuddy", apiKey, id),
    ).toThrow("MARKET_CONFIG_INVALID");
  });
});
