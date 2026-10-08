import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkBuddyMemoryPanel } from "@/components/workbuddy/WorkBuddyMemoryPanel";
import { workbuddyMemoryApi } from "@/lib/api/workbuddy";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/lib/api/workbuddy", () => ({
  workbuddyMemoryApi: { read: vi.fn(), save: vi.fn() },
}));
vi.mock("@/components/MarkdownEditor", () => ({
  default: ({
    value,
    onChange,
    readOnly,
  }: {
    value: string;
    onChange: (value: string) => void;
    readOnly: boolean;
  }) => (
    <textarea
      aria-label="memory"
      value={value}
      readOnly={readOnly}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

describe("WorkBuddy memory editing", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(workbuddyMemoryApi.read).mockResolvedValue({
      content: "original",
      revision: "v1",
      exists: true,
    });
  });
  it("saves with the read revision and preserves a draft after a conflict", async () => {
    vi.mocked(workbuddyMemoryApi.save).mockRejectedValue(
      "workbuddy_memory_conflict",
    );
    render(<WorkBuddyMemoryPanel onClose={() => {}} />);
    const editor = await screen.findByLabelText("memory");
    fireEvent.change(editor, { target: { value: "draft" } });
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));
    await waitFor(() =>
      expect(workbuddyMemoryApi.save).toHaveBeenCalledWith(
        "MEMORY.md",
        "draft",
        "v1",
      ),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "workbuddy.memoryEditor.errors.workbuddy_memory_conflict",
    );
    expect(editor).toHaveValue("draft");
  });
  it("asks before switching away from unsaved changes", async () => {
    render(<WorkBuddyMemoryPanel onClose={() => {}} />);
    fireEvent.change(await screen.findByLabelText("memory"), {
      target: { value: "unsaved" },
    });
    fireEvent.click(
      screen.getByRole("tab", { name: "workbuddy.memoryEditor.user" }),
    );
    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "workbuddy.memoryEditor.discard",
    );
    expect(workbuddyMemoryApi.read).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "common.cancel" }));
    expect(screen.getByLabelText("memory")).toHaveValue("unsaved");
  });
});
