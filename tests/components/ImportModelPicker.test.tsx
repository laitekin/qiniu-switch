import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { ImportModelPicker } from "@/components/deeplink/ImportModelPicker";
import { fetchModelsForConfig } from "@/lib/api/model-fetch";

vi.mock("@/lib/api/model-fetch", () => ({ fetchModelsForConfig: vi.fn() }));
const props = {
  app: "codex",
  baseUrl: "https://api.qnaigc.com/bypass/openai/v1",
  apiKey: "test-key",
  disabled: false,
  onChange: vi.fn(),
  onValidChange: vi.fn(),
};

describe("Import model discovery", () => {
  it("uses only returned IDs and does not fall back to a preset on failure", async () => {
    vi.mocked(fetchModelsForConfig).mockRejectedValueOnce(
      new Error("HTTP 401"),
    );
    render(<ImportModelPicker {...props} value="gpt-6-astra" />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(props.onValidChange).toHaveBeenLastCalledWith(false);
    expect(props.onChange).not.toHaveBeenCalled();
  });
  it("retries and accepts only the fetched selection", async () => {
    vi.mocked(fetchModelsForConfig)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "api-model-new", ownedBy: null }]);
    render(<ImportModelPicker {...props} />);
    await screen.findByRole("status");
    await userEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("combobox")).toBeEnabled());
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(
      screen.getByRole("option", { name: "api-model-new" }),
    );
    expect(props.onChange).toHaveBeenCalledWith("api-model-new");
  });
  it("ignores a late response after the credentials change", async () => {
    let resolveOld!: (models: { id: string; ownedBy: null }[]) => void;
    vi.mocked(fetchModelsForConfig)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce([{ id: "current-account-model", ownedBy: null }]);
    const { rerender } = render(<ImportModelPicker {...props} />);
    rerender(<ImportModelPicker {...props} apiKey="different-key" />);
    await waitFor(() => expect(screen.getByRole("combobox")).toBeEnabled());
    resolveOld([{ id: "old-account-model", ownedBy: null }]);
    await userEvent.click(screen.getByRole("combobox"));
    expect(
      screen.getByRole("option", { name: "current-account-model" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "old-account-model" }),
    ).not.toBeInTheDocument();
  });
});
