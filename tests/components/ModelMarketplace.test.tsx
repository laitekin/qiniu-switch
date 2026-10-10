import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ModelMarketplace } from "@/components/marketplace/ModelMarketplace";
import { MarketMarkdown } from "@/components/marketplace/MarketMarkdown";
import { qiniuMarketApi, type QiniuMarketModel } from "@/lib/api/qiniuMarket";
import userEvent from "@testing-library/user-event";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/lib/api/qiniuMarket", () => ({
  qiniuMarketApi: { list: vi.fn(), detail: vi.fn() },
}));
vi.mock("@/lib/api/settings", () => ({
  settingsApi: { openExternal: vi.fn() },
}));

const textModel: QiniuMarketModel = {
  id: "text-alpha",
  name: "Text Alpha",
  vendor: "Example Text",
  description: "Official text model description",
  capabilities: ["推理"],
  prices: [{ label: "输入", value: "¥0.002", unit: "1K tokens" }],
  isNew: false,
  supportsChat: true,
  available: true,
  detailUrl: "https://www.qiniu.com/ai/models/text-alpha",
  apiIds: ["text-alpha-v1"],
  protocols: ["openai-chat"],
  inputModalities: ["text"],
  outputModalities: ["text"],
  retired: false,
};
const imageModel: QiniuMarketModel = {
  ...textModel,
  id: "image-beta",
  name: "Image Beta",
  vendor: "Example Image",
  capabilities: ["图像"],
  supportsChat: false,
  outputModalities: ["image"],
  prices: [],
};

function show() {
  const onConfigure = vi.fn();
  const onChat = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ModelMarketplace onConfigure={onConfigure} onChat={onChat} />
    </QueryClientProvider>,
  );
  return { onConfigure, onChat };
}

describe("Qiniu model marketplace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(qiniuMarketApi.list).mockResolvedValue({
      models: [textModel, imageModel],
      fetchedAt: "2026-09-29T00:00:00Z",
      sourceUrl: "https://www.qiniu.com/ai/models",
    });
    vi.mocked(qiniuMarketApi.detail).mockResolvedValue({
      ...textModel,
      contextWindow: "128K",
      overview: "## 官方说明\n\n支持真实接口返回的模型。",
    });
  });

  it("filters the fetched catalog and passes the selected model to configuration", async () => {
    const { onConfigure } = show();
    await screen.findByRole("article", { name: "Text Alpha" });
    expect(
      screen.getByRole("article", { name: "Image Beta" }),
    ).toBeInTheDocument();
    expect(qiniuMarketApi.detail).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("combobox", { name: "marketplace.vendor" }),
    );
    await userEvent.click(
      screen.getByRole("option", { name: "Example Image" }),
    );
    expect(
      screen.queryByRole("article", { name: "Text Alpha" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "marketplace.clearFilters" }),
    );
    fireEvent.change(screen.getByLabelText("marketplace.search"), {
      target: { value: "推理" },
    });
    expect(
      screen.queryByRole("article", { name: "Image Beta" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole("article", { name: "Text Alpha" })).getByRole(
        "button",
        { name: "marketplace.configure" },
      ),
    );
    expect(onConfigure).toHaveBeenCalledWith(textModel);
  });

  it("does not offer unsupported media models as chat or client configurations", async () => {
    const { onChat, onConfigure } = show();
    const card = await screen.findByRole("article", { name: "Image Beta" });
    const chat = within(card).getByRole("button", { name: "marketplace.try" });
    const configure = within(card).getByRole("button", {
      name: "marketplace.configure",
    });
    expect(chat).toBeDisabled();
    expect(configure).toBeDisabled();
    fireEvent.click(chat);
    fireEvent.click(configure);
    expect(onChat).not.toHaveBeenCalled();
    expect(onConfigure).not.toHaveBeenCalled();
    expect(
      within(card).getByText("marketplace.priceUnavailable"),
    ).toBeInTheDocument();
  });

  it("keeps retired models visible separately without counting them as available", async () => {
    vi.mocked(qiniuMarketApi.list).mockResolvedValue({
      models: [
        textModel,
        {
          ...textModel,
          id: "retired-model",
          name: "Retired Model",
          retired: true,
          available: false,
        },
      ],
    });
    show();
    await screen.findByRole("article", { name: "Text Alpha" });
    expect(
      screen.getByRole("heading", { name: /marketplace.explore/ }),
    ).toHaveTextContent("1");
    expect(screen.getByText(/marketplace.retired/)).toHaveTextContent("1");
  });

  it("fetches official details on demand and uses enriched metadata for chat", async () => {
    const { onChat } = show();
    const card = await screen.findByRole("article", { name: "Text Alpha" });
    fireEvent.click(
      within(card).getByRole("button", { name: "marketplace.viewModel" }),
    );
    await waitFor(() =>
      expect(qiniuMarketApi.detail).toHaveBeenCalledWith("text-alpha"),
    );
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("128K")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("heading", { name: "官方说明" }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "marketplace.try" }),
    );
    expect(onChat).toHaveBeenCalledWith(
      expect.objectContaining({ id: "text-alpha", contextWindow: "128K" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("allows configuring an Anthropic-only text model without offering basic chat", async () => {
    const anthropicModel = {
      ...textModel,
      protocols: ["anthropic-messages"],
      supportsChat: false,
    };
    vi.mocked(qiniuMarketApi.list).mockResolvedValue({
      models: [anthropicModel],
    });
    const { onConfigure } = show();
    const card = await screen.findByRole("article", { name: "Text Alpha" });
    expect(
      within(card).getByRole("button", { name: "marketplace.try" }),
    ).toBeDisabled();
    const configure = within(card).getByRole("button", {
      name: "marketplace.configure",
    });
    expect(configure).toBeEnabled();
    fireEvent.click(configure);
    expect(onConfigure).toHaveBeenCalledWith(anthropicModel);
  });

  it("renders official Markdown as text without enabling HTML or script markup", () => {
    const { container } = render(
      <MarketMarkdown
        content={
          '# Model\n\n<img src=x onerror="alert(1)">\n\n| Capability | Value |\n| --- | --- |\n| Context | **128K** |\n\n```json\n{"model":"example"}\n```'
        }
      />,
    );
    expect(screen.getByRole("heading", { name: "Model" })).toBeInTheDocument();
    expect(screen.getByRole("table")).toHaveTextContent("128K");
    expect(container.querySelector("img")).toBeNull();
    expect(
      screen.getByText('<img src=x onerror="alert(1)">'),
    ).toBeInTheDocument();
    expect(container.querySelector("pre")).toHaveTextContent(
      '{"model":"example"}',
    );
  });
});
