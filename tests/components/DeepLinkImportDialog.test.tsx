import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DeepLinkImportDialog } from "@/components/DeepLinkImportDialog";
import { emitTauriEvent } from "../msw/tauriMocks";
import { deeplinkApi } from "@/lib/api/deeplink";
import userEvent from "@testing-library/user-event";
import { APP_IDS } from "@/config/appConfig";
import { fetchModelsForConfig } from "@/lib/api/model-fetch";

vi.mock("@/lib/api/model-fetch", () => ({
  fetchModelsForConfig: vi.fn().mockResolvedValue([
    { id: "server-model-a", ownedBy: null },
    { id: "server-model-b", ownedBy: null },
  ]),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h1>{children}</h1>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    {children}
  </QueryClientProvider>
);

describe("DeepLinkImportDialog", () => {
  it("imports Qiniu to the selected client and navigates there after success", async () => {
    const take = vi.spyOn(deeplinkApi, "takePending").mockResolvedValueOnce({
      version: "v1",
      resource: "provider",
      app: "claude",
      name: "七牛云",
      endpoint: "https://api.qnaigc.com",
      apiKey: "sk-demo",
    });
    const save = vi
      .spyOn(deeplinkApi, "importFromDeeplink")
      .mockResolvedValue({ type: "provider", id: "new-workbuddy" });
    const navigate = vi.fn();
    render(<DeepLinkImportDialog onProviderImported={navigate} />, {
      wrapper: Wrapper,
    });
    await userEvent.click(
      await screen.findByRole("combobox", { name: "deeplink.targetApp" }),
    );
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(APP_IDS.length);
    for (const option of options)
      expect(option.querySelector("svg, img")).not.toBeNull();
    await userEvent.click(screen.getByRole("option", { name: "WorkBuddy" }));
    expect(
      screen.getByRole("button", { name: "deeplink.import" }),
    ).toBeDisabled();
    const modelPicker = screen.getByRole("combobox", {
      name: "deeplink.model",
    });
    await waitFor(() => expect(modelPicker).toBeEnabled());
    await userEvent.click(modelPicker);
    await userEvent.click(
      screen.getByRole("option", { name: "server-model-b" }),
    );
    expect(fetchModelsForConfig).toHaveBeenCalledWith(
      "https://api.qnaigc.com/v1",
      "sk-demo",
      false,
      "https://api.qnaigc.com/v1/models",
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "deeplink.import" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "deeplink.import" }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          app: "workbuddy",
          endpoint: "https://api.qnaigc.com/v1",
          apiKey: "sk-demo",
          model: "server-model-b",
        }),
      ),
    );
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("workbuddy"));
    take.mockRestore();
    save.mockRestore();
  });
  it("receives a protocol notification after the app is already open", async () => {
    const take = vi
      .spyOn(deeplinkApi, "takePending")
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        version: "v1",
        resource: "provider",
        app: "claude",
        name: "Live Qiniu import",
        endpoint: "https://api.qnaigc.com",
        apiKey: "sk-demo",
      });
    render(<DeepLinkImportDialog />, { wrapper: Wrapper });
    await waitFor(() => expect(take).toHaveBeenCalledTimes(1));
    act(() => emitTauriEvent("deeplink-pending", null));
    expect(await screen.findByText("Live Qiniu import")).toBeInTheDocument();
    take.mockRestore();
  });
  it("shows a cold-start import after the listener mounts without importing automatically", async () => {
    const take = vi.spyOn(deeplinkApi, "takePending").mockResolvedValueOnce({
      version: "v1",
      resource: "provider",
      app: "claude",
      name: "Cold start Qiniu",
      endpoint: "https://api.qnaigc.com",
      homepage: "https://www.qiniu.com",
      apiKey: "sk-demo",
      icon: "qiniu",
    });
    const save = vi.spyOn(deeplinkApi, "importFromDeeplink");
    render(<DeepLinkImportDialog />, { wrapper: Wrapper });
    expect(await screen.findByText("Cold start Qiniu")).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    take.mockRestore();
    save.mockRestore();
  });
  it("renders masked usage access token and user id for provider imports", async () => {
    render(<DeepLinkImportDialog />, { wrapper: Wrapper });

    act(() => {
      emitTauriEvent("deeplink-import", {
        version: "v1",
        resource: "provider",
        app: "claude",
        name: "Test Provider",
        homepage: "https://example.com",
        endpoint: "https://api.example.com",
        apiKey: "sk-provider-key",
        usageEnabled: true,
        usageScript: btoa("console.log('usage');"),
        usageApiKey: "sk-usage-key",
        usageBaseUrl: "https://usage.example.com",
        usageAccessToken: "pat-secret-token",
        usageUserId: "user-12345",
        usageAutoInterval: 60,
      });
    });

    await waitFor(() => {
      expect(screen.getByText("用量访问令牌")).toBeInTheDocument();
    });

    expect(screen.getByText("用量用户 ID")).toBeInTheDocument();
    expect(screen.getByText("user-12345")).toBeInTheDocument();
    // Masked: first 4 chars + 12 stars
    expect(screen.getByText("pat-************")).toBeInTheDocument();
  });

  it("shows usage credentials even when the deeplink carries no usageScript", async () => {
    // 后端 build_provider_meta 在任一 usage 字段存在时即持久化（含 access_token
    // 与 user_id）。若对话框只在 usageScript 存在时开门，这条链接会把凭据静默
    // 写进供应商配置。撤销门槛 widening（恢复只按 usageScript 开门）本测试即失败。
    render(<DeepLinkImportDialog />, { wrapper: Wrapper });

    act(() => {
      emitTauriEvent("deeplink-import", {
        version: "v1",
        resource: "provider",
        app: "claude",
        name: "Token Only Provider",
        homepage: "https://example.com",
        endpoint: "https://api.example.com",
        apiKey: "sk-provider-key",
        usageAccessToken: "pat-secret-token",
        usageUserId: "user-12345",
      });
    });

    await waitFor(() => {
      expect(screen.getByText("用量访问令牌")).toBeInTheDocument();
    });

    expect(screen.getByText("pat-************")).toBeInTheDocument();
    expect(screen.getByText("用量用户 ID")).toBeInTheDocument();
    expect(screen.getByText("user-12345")).toBeInTheDocument();
    // 没有脚本就不应渲染脚本执行警告与脚本代码区
    expect(
      screen.queryByText(
        "这是一段 JavaScript 代码，启用后会在查询用量时执行。请确认来源可信后再导入。",
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("脚本代码")).not.toBeInTheDocument();
  });
});
