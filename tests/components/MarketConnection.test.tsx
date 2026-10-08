import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MarketConnection } from "@/components/marketplace/MarketConnection";
import { fetchModelsForConfig, type FetchedModel } from "@/lib/api/model-fetch";

vi.mock("@/lib/api/model-fetch", () => ({ fetchModelsForConfig: vi.fn() }));

describe("Marketplace connection", () => {
  it("requests the exact Qiniu catalog only after connecting and returns only discovered models", async () => {
    const onModelsChange = vi.fn();
    const onStatusChange = vi.fn();
    vi.mocked(fetchModelsForConfig).mockResolvedValueOnce([
      { id: "actual-model", ownedBy: "vendor" },
      { id: "actual-model", ownedBy: "vendor" },
      { id: "", ownedBy: null },
    ]);
    render(
      <MarketConnection
        apiKey="sk-test"
        onApiKeyChange={vi.fn()}
        onModelsChange={onModelsChange}
        onStatusChange={onStatusChange}
      />,
    );
    expect(fetchModelsForConfig).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "连接" }));
    expect(fetchModelsForConfig).toHaveBeenCalledWith(
      "https://api.qnaigc.com/v1",
      "sk-test",
      false,
      "https://api.qnaigc.com/v1/models",
    );
    await waitFor(() =>
      expect(onStatusChange).toHaveBeenLastCalledWith("ready"),
    );
    expect(onModelsChange).toHaveBeenLastCalledWith([
      { id: "actual-model", ownedBy: "vendor" },
    ]);
  });

  it("discards a stale model response after changing credentials", async () => {
    let resolve!: (models: FetchedModel[]) => void;
    vi.mocked(fetchModelsForConfig).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const props = {
      onApiKeyChange: vi.fn(),
      onModelsChange: vi.fn(),
      onStatusChange: vi.fn(),
    };
    const { rerender } = render(
      <MarketConnection {...props} apiKey="sk-first" />,
    );
    await userEvent.click(screen.getByRole("button", { name: "连接" }));
    rerender(<MarketConnection {...props} apiKey="sk-second" />);
    await act(async () =>
      resolve([{ id: "old-account-model", ownedBy: null }]),
    );
    expect(props.onModelsChange).toHaveBeenLastCalledWith([]);
    expect(props.onStatusChange).toHaveBeenLastCalledWith("idle");
  });

  it("allows reconnecting after navigation interrupted a model request", () => {
    render(
      <MarketConnection
        apiKey="sk-test"
        initialStatus="loading"
        onApiKeyChange={vi.fn()}
        onModelsChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "连接" })).toBeEnabled();
    expect(fetchModelsForConfig).not.toHaveBeenCalled();
  });

  it("never displays upstream errors that may contain a key", async () => {
    vi.mocked(fetchModelsForConfig).mockRejectedValueOnce(
      new Error("reflected sk-private-key"),
    );
    render(
      <MarketConnection
        apiKey="sk-test"
        onApiKeyChange={vi.fn()}
        onModelsChange={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "连接" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("连接失败");
    expect(screen.queryByText(/sk-private-key/)).not.toBeInTheDocument();
  });
});
