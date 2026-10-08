import { opencodeProviderPresets } from "./opencodeProviderPresets";
import type { McodeProviderPreset } from "./mcodeProviderPresets";

// Reuse the maintained Chat Completions catalog. Other protocols and required
// custom headers cannot be represented by our WorkBuddy adapter.
export const workbuddyProviderPresets: McodeProviderPreset[] =
  opencodeProviderPresets.flatMap((preset) => {
    const config = preset.settingsConfig;
    if (
      config.npm !== "@ai-sdk/openai-compatible" ||
      !config.options.baseURL ||
      Object.keys(config.options.headers ?? {}).length > 0
    )
      return [];
    return [
      {
        ...preset,
        providerKey: preset.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        settingsConfig: {
          name: preset.name,
          kind: "custom",
          enabled: true,
          api: "openai-completions",
          options: { baseURL: config.options.baseURL, apiKey: "" },
          models: Object.fromEntries(
            Object.entries(config.models).map(([id, model]) => [
              id,
              {
                name: model.name ?? id,
                limit: model.limit,
                options: {
                  supportsToolCall: true,
                  supportsImages:
                    (
                      model.modalities as { input?: string[] } | undefined
                    )?.input?.includes("image") ?? false,
                },
              },
            ]),
          ),
        },
      },
    ];
  });
