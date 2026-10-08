import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MarketChatDialog } from "@/components/marketplace/MarketChatDialog";
import {
  sendMarketChat,
  type MarketChatResponse,
} from "@/lib/api/qiniuMarketChat";

vi.mock("@/lib/api/qiniuMarketChat", () => ({ sendMarketChat: vi.fn() }));

const props = {
  open: true,
  onOpenChange: vi.fn(),
  apiKey: "sk-unit-test",
  modelId: "api-model-id",
  modelName: "Official model",
};

describe("Marketplace text chat", () => {
  it("sends only on explicit submission and retains the real conversation context", async () => {
    vi.mocked(sendMarketChat)
      .mockResolvedValueOnce({ content: "Actual response" })
      .mockResolvedValueOnce({ content: "Second response" });
    render(<MarketChatDialog {...props} />);
    expect(sendMarketChat).not.toHaveBeenCalled();
    await userEvent.type(screen.getByRole("textbox"), "Hello");
    expect(sendMarketChat).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "发送" }));
    expect(await screen.findByText("Actual response")).toBeInTheDocument();
    expect(sendMarketChat).toHaveBeenNthCalledWith(
      1,
      "sk-unit-test",
      "api-model-id",
      [{ role: "user", content: "Hello" }],
    );
    await userEvent.type(screen.getByRole("textbox"), "Next");
    await userEvent.click(screen.getByRole("button", { name: "发送" }));
    await screen.findByText("Second response");
    expect(sendMarketChat).toHaveBeenNthCalledWith(
      2,
      "sk-unit-test",
      "api-model-id",
      [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Actual response" },
        { role: "user", content: "Next" },
      ],
    );
  });

  it("preserves an unsent retry draft and does not show raw errors or fake replies", async () => {
    vi.mocked(sendMarketChat).mockRejectedValueOnce(
      new Error("upstream echoed sk-private"),
    );
    render(<MarketChatDialog {...props} />);
    await userEvent.type(screen.getByRole("textbox"), "Keep this question");
    await userEvent.click(screen.getByRole("button", { name: "发送" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("请求失败");
    expect(screen.getByRole("textbox")).toHaveValue("Keep this question");
    expect(
      within(screen.getByRole("log")).queryByText("Keep this question"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/sk-private/)).not.toBeInTheDocument();
  });

  it("clears session text and ignores pending replies after closing", async () => {
    let resolve!: (response: MarketChatResponse) => void;
    vi.mocked(sendMarketChat).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const { rerender } = render(<MarketChatDialog {...props} />);
    await userEvent.type(screen.getByRole("textbox"), "Private question");
    await userEvent.click(screen.getByRole("button", { name: "发送" }));
    await waitFor(() => expect(sendMarketChat).toHaveBeenCalledOnce());
    rerender(<MarketChatDialog {...props} open={false} />);
    await act(async () => resolve({ content: "Late response" }));
    rerender(<MarketChatDialog {...props} />);
    expect(screen.queryByText("Late response")).not.toBeInTheDocument();
    expect(screen.queryByText("Private question")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("");
  });
});
