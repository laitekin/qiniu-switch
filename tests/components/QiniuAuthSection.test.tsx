import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QiniuAuthSection } from "@/components/settings/QiniuAuthSection";
import { qiniuApi } from "@/lib/api/qiniu";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/api/qiniu", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api/qiniu")>();
  return {
    ...original,
    qiniuApi: {
      status: vi.fn(),
      query: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
    },
  };
});

function show() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <QiniuAuthSection />
    </QueryClientProvider>,
  );
}

describe("Qiniu management authentication", () => {
  beforeEach(() => vi.resetAllMocks());
  it("connects with desktop input, clears both inputs, and disconnects", async () => {
    vi.mocked(qiniuApi.status).mockResolvedValue({ configured: false });
    vi.mocked(qiniuApi.connect).mockImplementation(async () => {
      vi.mocked(qiniuApi.status).mockResolvedValue({
        configured: true,
        verified: true,
      });
      return { status: true, data: [] };
    });
    vi.mocked(qiniuApi.disconnect).mockImplementation(async () => {
      vi.mocked(qiniuApi.status).mockResolvedValue({
        configured: false,
        verified: false,
      });
    });
    show();
    fireEvent.change(screen.getByLabelText("AK"), {
      target: { value: "test-access" },
    });
    fireEvent.change(screen.getByLabelText("SK"), {
      target: { value: "test-secret" },
    });
    expect(screen.getByLabelText("SK")).toHaveAttribute("type", "password");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "qiniu.connect" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "qiniu.connect" }));
    expect(await screen.findByText("qiniu.verified")).toBeInTheDocument();
    expect(qiniuApi.connect).toHaveBeenCalledWith("test-access", "test-secret");
    expect(qiniuApi.query).not.toHaveBeenCalled();
    expect(screen.getByLabelText("AK")).toHaveValue("");
    expect(screen.getByLabelText("SK")).toHaveValue("");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "qiniu.disconnect" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "qiniu.disconnect" }));
    await waitFor(() => expect(qiniuApi.disconnect).toHaveBeenCalledOnce());
    expect(await screen.findByText("qiniu.unconfigured")).toBeInTheDocument();
  });
  it("requires credentials before querying management data", async () => {
    vi.mocked(qiniuApi.status).mockResolvedValue({ configured: false });
    show();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "qiniu.connect" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "qiniu.connect" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "qiniu.errors.qiniu_missing_credentials",
    );
    expect(qiniuApi.query).not.toHaveBeenCalled();
  });
  it("only marks verification after a successful key query, and clears it on failure", async () => {
    vi.mocked(qiniuApi.status).mockResolvedValue({ configured: true });
    vi.mocked(qiniuApi.query).mockResolvedValue({
      status: true,
      data: [{ name: "Example", key: "sk-***", enabled: true }],
    });
    show();
    await waitFor(() =>
      expect(screen.getByText("qiniu.unverified")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "qiniu.connect" }));
    expect(await screen.findByText("qiniu.verified")).toBeInTheDocument();
    expect(screen.getByText("Example")).toBeInTheDocument();
    expect(qiniuApi.query).toHaveBeenCalledWith("keys", {});
    vi.mocked(qiniuApi.query).mockRejectedValue("qiniu_http_401");
    fireEvent.click(screen.getByRole("button", { name: "qiniu.connect" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "qiniu.httpError",
    );
    expect(screen.queryByText("qiniu.verified")).not.toBeInTheDocument();
    expect(screen.queryByText("Example")).not.toBeInTheDocument();
  });
});
