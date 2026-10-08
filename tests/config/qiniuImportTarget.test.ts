import { describe, expect, it } from "vitest";
import {
  QINIU_IMPORT_TARGETS,
  canChooseQiniuImportTarget,
  changeQiniuImportTarget,
} from "@/utils/qiniuImportTarget";
import type { DeepLinkImportRequest } from "@/lib/api/deeplink";

const request: DeepLinkImportRequest = {
  version: "v1",
  resource: "provider",
  app: "claude",
  name: "七牛云",
  endpoint: "https://api.qnaigc.com",
  apiKey: "sk-demo",
};
describe("Qiniu import target", () => {
  it.each(QINIU_IMPORT_TARGETS)("adapts the existing preset for %s", (app) => {
    const next = changeQiniuImportTarget(request, app);
    expect(next.app).toBe(app);
    expect(next.apiKey).toBe(request.apiKey);
    expect(new URL(next.endpoint!).hostname).toBe("api.qnaigc.com");
    expect(next.model).toBeUndefined();
  });
  it("uses the selected protocol endpoint and keeps the international host", () => {
    const next = changeQiniuImportTarget(
      { ...request, endpoint: "https://api.modelink.ai" },
      "codex",
    );
    expect(next.endpoint).toBe("https://api.modelink.ai/bypass/openai/v1");
    expect(changeQiniuImportTarget(next, "gemini").endpoint).toBe(
      "https://api.modelink.ai/bypass/vertex",
    );
  });
  it("does not rewrite custom endpoints or app-specific configuration payloads", () => {
    for (const source of [
      { ...request, endpoint: "https://example.com" },
      { ...request, config: "e30=" },
      { ...request, configUrl: "https://example.com/config.json" },
    ]) {
      expect(canChooseQiniuImportTarget(source)).toBe(false);
      expect(changeQiniuImportTarget(source, "codex")).toBe(source);
    }
  });
});
