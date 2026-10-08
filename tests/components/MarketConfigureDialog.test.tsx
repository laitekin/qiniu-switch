import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MarketConfigureDialog } from "@/components/marketplace/MarketConfigureDialog";
import { providersApi } from "@/lib/api/providers";
import { proxyApi } from "@/lib/api/proxy";
import type { QiniuMarketModel } from "@/lib/api/qiniuMarket";

vi.mock("@/lib/api/providers", () => ({
  providersApi: { add: vi.fn(), switch: vi.fn(), getAll: vi.fn() },
}));
vi.mock("@/lib/api/proxy", () => ({
  proxyApi: { getProxyStatus: vi.fn(), getProxyTakeoverStatus: vi.fn() },
}));
const model: QiniuMarketModel = {
  id: "official/model",
  name: "Model",
  vendor: "Vendor",
  apiIds: ["official/model", "actual-id"],
  protocols: ["openai-chat"],
  inputModalities: ["text"],
  outputModalities: ["text"],
  available: true,
  supportsChat: true,
  capabilities: [],
  prices: [],
};
const props = {
  model,
  open: true,
  onOpenChange: vi.fn(),
  apiKey: "sk-unit-test",
  modelId: "actual-id",
  initialApp: "workbuddy" as const,
  onConfigured: vi.fn(),
};

describe("Marketplace configuration", () => {
  beforeEach(() => {
    vi.mocked(providersApi.add).mockResolvedValue(true);
    vi.mocked(providersApi.switch).mockResolvedValue({ warnings: [] });
    vi.mocked(proxyApi.getProxyStatus).mockResolvedValue({
      running: false,
    } as never);
  });
  it("creates one new provider and applies it only after explicit confirmation", async () => {
    render(<MarketConfigureDialog {...props} />);
    expect(providersApi.add).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "确认配置" }));
    await waitFor(() => expect(props.onConfigured).toHaveBeenCalled());
    const [provider, app, writeLive] = vi.mocked(providersApi.add).mock
      .calls[0];
    expect(app).toBe("workbuddy");
    expect(writeLive).toBe(false);
    expect(provider.id).toMatch(/^qiniu-market-/);
    expect(Object.keys(provider.settingsConfig.models)).toEqual(["actual-id"]);
    expect(providersApi.switch).toHaveBeenCalledWith(provider.id, "workbuddy");
    expect(props.onConfigured).toHaveBeenCalledWith("workbuddy", provider.id);
  });
  it("saves a routing-dependent provider without changing routing or enabling it", async () => {
    vi.mocked(proxyApi.getProxyTakeoverStatus).mockResolvedValue({
      codex: false,
    } as never);
    render(<MarketConfigureDialog {...props} initialApp="codex" />);
    await userEvent.click(screen.getByRole("button", { name: "确认配置" }));
    expect(
      await screen.findByText("已保存。请在客户端配置页开启路由，再启用此配置"),
    ).toBeInTheDocument();
    expect(providersApi.switch).not.toHaveBeenCalled();
    expect(props.onConfigured).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "查看配置" }));
    expect(props.onConfigured).toHaveBeenCalledWith(
      "codex",
      expect.any(String),
    );
  });
  it("reuses the saved provider when applying fails and retry does not duplicate it", async () => {
    vi.mocked(providersApi.switch).mockRejectedValueOnce(
      new Error("private error sk-unit-test"),
    );
    render(<MarketConfigureDialog {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "确认配置" }));
    await screen.findByRole("alert");
    expect(screen.queryByText(/sk-unit-test/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "重试应用" }));
    await waitFor(() => expect(props.onConfigured).toHaveBeenCalled());
    expect(providersApi.add).toHaveBeenCalledTimes(1);
    expect(providersApi.switch).toHaveBeenCalledTimes(2);
  });
});
