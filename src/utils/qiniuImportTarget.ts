import type { DeepLinkImportRequest } from "@/lib/api/deeplink";
import { getQiniuDefaultProvider } from "@/config/qiniuDefaultProvider";
import { extractCodexBaseUrl } from "./providerConfigUtils";
import { APP_IDS } from "@/config/appConfig";

export const QINIU_IMPORT_TARGETS = APP_IDS;
export type QiniuImportTarget = (typeof QINIU_IMPORT_TARGETS)[number];

export function canChooseQiniuImportTarget(request: DeepLinkImportRequest) {
  if (request.resource !== "provider" || request.config || request.configUrl)
    return false;
  try {
    const url = new URL(request.endpoint ?? "");
    return (
      ["https://api.qnaigc.com", "https://api.modelink.ai"].includes(
        url.origin,
      ) &&
      ["/", "/v1", "/bypass/openai/v1", "/bypass/vertex"].includes(
        url.pathname.replace(/\/$/, "") || "/",
      ) &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function changeQiniuImportTarget(
  request: DeepLinkImportRequest,
  app: QiniuImportTarget,
): DeepLinkImportRequest {
  if (!canChooseQiniuImportTarget(request) || request.app === app)
    return request;
  // Clients without a dedicated preset use the existing compatible protocol preset.
  const presetApp =
    app === "grokbuild"
      ? "codex"
      : app === "antigravity"
        ? "gemini"
        : app === "openclaw" || app === "hermes"
          ? "opencode"
          : app;
  const config = getQiniuDefaultProvider(presetApp)!.settingsConfig;
  const endpoint =
    presetApp === "codex"
      ? extractCodexBaseUrl(config.config)
      : (config.env?.ANTHROPIC_BASE_URL ??
        config.env?.GOOGLE_GEMINI_BASE_URL ??
        config.options?.baseURL ??
        config.baseUrl);
  const targetUrl = new URL(endpoint);
  targetUrl.host = new URL(request.endpoint!).host;
  return {
    ...request,
    app,
    endpoint: targetUrl.toString().replace(/\/$/, ""),
    model: undefined,
    haikuModel: undefined,
    sonnetModel: undefined,
    opusModel: undefined,
  };
}
