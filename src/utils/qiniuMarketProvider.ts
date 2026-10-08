import type { AppId } from "@/lib/api/types";
import type { QiniuMarketModel } from "@/lib/api/qiniuMarket";
import type { Provider } from "@/types";
import { CLAUDE_DESKTOP_ROLE_ROUTE_IDS } from "@/config/claudeDesktopProviderPresets";
import {
  generateThirdPartyAuth,
  generateThirdPartyConfig,
} from "@/config/codexProviderPresets";
import {
  buildGrokBuildConfig,
  GROK_BUILD_DEFAULT_CONTEXT_WINDOW,
} from "@/utils/grokBuildConfig";

const OPENAI_BASE = "https://api.qnaigc.com/v1";
const ANTHROPIC_BASE = "https://api.qnaigc.com";

export function marketModelSupportsApp(
  model: QiniuMarketModel,
  app: AppId,
): boolean {
  if (
    !model.available ||
    model.retired ||
    !model.outputModalities.includes("text")
  )
    return false;
  if (app === "gemini" || app === "antigravity")
    return model.protocols.some((protocol) =>
      ["gemini-native", "vertex-bypass"].includes(protocol),
    );
  if (app === "workbuddy") return model.protocols.includes("openai-chat");
  return model.protocols.some((protocol) =>
    ["openai-chat", "anthropic-messages"].includes(protocol),
  );
}

// Metadata may contain "128K" or "1M". Never infer capacities from model names.
function tokenLimit(value?: string): number | undefined {
  if (!value) return undefined;
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*([kKmM])?$/);
  if (!match) return undefined;
  const multiplier =
    match[2]?.toLowerCase() === "m" ? 1_000_000 : match[2] ? 1000 : 1;
  const result = Number(match[1]) * multiplier;
  return Number.isSafeInteger(result) && result > 0 ? result : undefined;
}

/** Build a new provider using an already verified /v1/models ID. */
export function buildQiniuMarketProvider(
  model: QiniuMarketModel,
  modelId: string,
  app: AppId,
  apiKey: string,
  id: string,
): Provider {
  if (
    !marketModelSupportsApp(model, app) ||
    !modelId.trim() ||
    !apiKey.trim() ||
    !id
  ) {
    throw new Error("MARKET_CONFIG_INVALID");
  }
  const anthropic =
    model.protocols.includes("anthropic-messages") &&
    (app === "claude" ||
      app === "claude-desktop" ||
      !model.protocols.includes("openai-chat"));
  const baseUrl = anthropic ? ANTHROPIC_BASE : OPENAI_BASE;
  const apiFormat = anthropic ? "anthropic" : "openai_chat";
  const api = anthropic ? "anthropic-messages" : "openai-completions";
  const context = tokenLimit(model.contextWindow);
  const output = tokenLimit(model.maxOutput);
  const name = `七牛云 · ${model.name}`;
  const provider: Provider = {
    id,
    name,
    icon: "qiniu",
    category: "aggregator",
    websiteUrl: "https://www.qiniu.com",
    createdAt: Date.now(),
    settingsConfig: {},
  };
  const nativeModel = {
    id: modelId,
    name: model.name,
    ...(context ? { contextWindow: context } : {}),
    ...(output ? { maxTokens: output } : {}),
    ...(model.inputModalities.length ? { input: model.inputModalities } : {}),
  };
  const modelMap = {
    [modelId]: {
      name: model.name,
      ...(context || output
        ? {
            limit: {
              ...(context ? { context } : {}),
              ...(output ? { output } : {}),
            },
          }
        : {}),
      ...(model.inputModalities.length || model.outputModalities.length
        ? {
            modalities: {
              input: model.inputModalities,
              output: model.outputModalities,
            },
          }
        : {}),
    },
  };

  switch (app) {
    case "claude":
    case "claude-desktop":
      provider.settingsConfig = {
        env: {
          ANTHROPIC_BASE_URL: baseUrl,
          ANTHROPIC_AUTH_TOKEN: apiKey.trim(),
          ANTHROPIC_MODEL: modelId,
          ANTHROPIC_DEFAULT_SONNET_MODEL: modelId,
          ANTHROPIC_DEFAULT_OPUS_MODEL: modelId,
          ANTHROPIC_DEFAULT_HAIKU_MODEL: modelId,
        },
      };
      provider.meta = { apiFormat };
      if (app === "claude-desktop") {
        provider.meta.claudeDesktopMode = "proxy";
        provider.meta.claudeDesktopModelRoutes = Object.fromEntries(
          [
            CLAUDE_DESKTOP_ROLE_ROUTE_IDS.sonnet,
            CLAUDE_DESKTOP_ROLE_ROUTE_IDS.opus,
            CLAUDE_DESKTOP_ROLE_ROUTE_IDS.haiku,
          ].map((routeId) => [
            routeId,
            { model: modelId, labelOverride: model.name, supports1m: false },
          ]),
        );
      }
      break;
    case "codex":
      provider.settingsConfig = {
        auth: generateThirdPartyAuth(apiKey.trim()),
        config: generateThirdPartyConfig("Qiniu", baseUrl, modelId),
        modelCatalog: {
          models: [
            {
              model: modelId,
              displayName: model.name,
              ...(context ? { contextWindow: context } : {}),
              ...(model.inputModalities.length
                ? { inputModalities: model.inputModalities }
                : {}),
            },
          ],
        },
      };
      provider.meta = { apiFormat };
      break;
    case "grokbuild":
      provider.settingsConfig = {
        config: buildGrokBuildConfig({
          model: modelId,
          upstreamModel: modelId,
          baseUrl,
          name: "Qiniu",
          apiKey: apiKey.trim(),
          apiBackend: "chat_completions",
          contextWindow: context ?? GROK_BUILD_DEFAULT_CONTEXT_WINDOW,
        }),
      };
      provider.meta = { apiFormat };
      break;
    case "gemini":
    case "antigravity":
      provider.settingsConfig = {
        env: {
          GOOGLE_GEMINI_BASE_URL: "https://api.qnaigc.com/bypass/vertex",
          GEMINI_API_KEY: apiKey.trim(),
          GEMINI_MODEL: modelId,
        },
      };
      break;
    case "opencode":
      provider.settingsConfig = {
        name,
        npm: anthropic ? "@ai-sdk/anthropic" : "@ai-sdk/openai-compatible",
        options: {
          baseURL: anthropic ? `${baseUrl}/v1` : baseUrl,
          apiKey: apiKey.trim(),
        },
        models: modelMap,
      };
      break;
    case "mcode":
    case "workbuddy":
      provider.settingsConfig = {
        name,
        vendor: "Qiniu",
        kind: "custom",
        enabled: true,
        api,
        options: { baseURL: baseUrl, apiKey: apiKey.trim() },
        models: modelMap,
      };
      if (app === "workbuddy") {
        provider.settingsConfig.models[modelId].options = {
          supportsImages: model.inputModalities.includes("image"),
          supportsToolCall: model.capabilities.some((capability) =>
            /tool|工具调用/i.test(capability),
          ),
        };
      }
      break;
    case "openclaw":
    case "pi":
      provider.settingsConfig = {
        name,
        baseUrl,
        apiKey: apiKey.trim(),
        api,
        models: [nativeModel],
      };
      break;
    case "hermes":
      provider.settingsConfig = {
        name: id,
        base_url: baseUrl,
        api_key: apiKey.trim(),
        api_mode: anthropic ? "anthropic_messages" : "chat_completions",
        models: [
          {
            id: modelId,
            name: model.name,
            ...(context ? { context_length: context } : {}),
          },
        ],
      };
      break;
  }
  return provider;
}
