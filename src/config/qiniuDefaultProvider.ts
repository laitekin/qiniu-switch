import type { AppId } from "@/lib/api/types";
import type { Provider } from "@/types";
import { providerPresets as claudeProviderPresets } from "./claudeProviderPresets";
import { claudeDesktopProviderPresets } from "./claudeDesktopProviderPresets";
import { codexProviderPresets } from "./codexProviderPresets";
import { geminiProviderPresets } from "./geminiProviderPresets";
import { opencodeProviderPresets } from "./opencodeProviderPresets";
import { piProviderPresets } from "./piProviderPresets";
import { mcodeProviderPresets } from "./mcodeProviderPresets";
import { workbuddyProviderPresets } from "./workbuddyProviderPresets";

// Reuse the same catalog as the add-provider form; no separate model list.
export function getQiniuDefaultProvider(app: AppId): Provider | undefined {
  const catalogs = {
    claude: claudeProviderPresets,
    "claude-desktop": claudeDesktopProviderPresets,
    codex: codexProviderPresets,
    gemini: geminiProviderPresets,
    opencode: opencodeProviderPresets,
    pi: piProviderPresets,
    mcode: mcodeProviderPresets,
    workbuddy: workbuddyProviderPresets,
  };
  if (!(app in catalogs)) return undefined;
  const preset = catalogs[app as keyof typeof catalogs].find(
    (item) => item.icon === "qiniu",
  );
  if (!preset) return undefined;

  const provider: Provider = {
    id: "qiniu-default",
    name: "七牛云",
    websiteUrl: "https://www.qiniu.com",
    icon: "qiniu",
    category: "aggregator",
    settingsConfig: {},
  };
  if (app === "codex") {
    const source = codexProviderPresets.find((p) => p.icon === "qiniu")!;
    provider.settingsConfig = { auth: source.auth, config: source.config };
  } else if (app === "claude-desktop") {
    const source = claudeDesktopProviderPresets.find(
      (p) => p.icon === "qiniu",
    )!;
    provider.settingsConfig = {
      env: { ANTHROPIC_BASE_URL: source.baseUrl, ANTHROPIC_AUTH_TOKEN: "" },
    };
    provider.meta = {
      claudeDesktopMode: source.mode,
      apiFormat: source.apiFormat,
      claudeDesktopModelRoutes: Object.fromEntries(
        (source.modelRoutes ?? []).map((route) => [
          route.routeId,
          { model: route.upstreamModel, supports1m: route.supports1m },
        ]),
      ),
    };
  } else if ("settingsConfig" in preset) {
    provider.settingsConfig = preset.settingsConfig;
    if (app === "gemini") {
      provider.settingsConfig = {
        ...provider.settingsConfig,
        env: { ...provider.settingsConfig.env, GEMINI_API_KEY: "" },
      };
    } else if (app === "workbuddy") {
      provider.settingsConfig = { ...provider.settingsConfig, vendor: "Qiniu" };
    }
  }
  return structuredClone(provider);
}

export function needsQiniuApiKey(provider: Provider): boolean {
  if (provider.id !== "qiniu-default") return false;
  const config = provider.settingsConfig;
  return ![
    config.env?.ANTHROPIC_AUTH_TOKEN,
    config.env?.ANTHROPIC_API_KEY,
    config.env?.GEMINI_API_KEY,
    config.auth?.OPENAI_API_KEY,
    config.options?.apiKey,
    config.apiKey,
  ].some((key) => typeof key === "string" && key.trim());
}
