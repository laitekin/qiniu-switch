import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import config from "../../src-tauri/tauri.conf.json";
import { checkForUpdate } from "@/lib/updater";

const check = vi.fn();
vi.mock("@tauri-apps/plugin-updater", () => ({ check }));

describe("Independent Qiniu Switch branding", () => {
  it("registers only the new protocol and no upstream update channel", () => {
    expect(config.identifier).toBe("com.qiniuswitch.desktop");
    expect(config.plugins["deep-link"].desktop.schemes).toEqual([
      "qiniuswitch",
    ]);
    expect(config.plugins).not.toHaveProperty("updater");
    expect(config.bundle.createUpdaterArtifacts).toBe(false);
  });
  it("does not invoke an updater when checking is disabled", async () => {
    await expect(checkForUpdate()).rejects.toThrow("not configured");
    expect(check).not.toHaveBeenCalled();
  });
  it("keeps the early theme script compatible with the desktop CSP", () => {
    const html = readFileSync("src/index.html", "utf8");
    const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
    const hash = createHash("sha256").update(script).digest("base64");
    expect(config.app.security.csp).toContain(`'sha256-${hash}'`);
    expect(script).toContain("qiniu-switch-theme");
  });
});
