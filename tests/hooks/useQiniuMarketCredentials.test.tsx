import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useQiniuMarketCredentials } from "@/hooks/useQiniuMarketCredentials";

describe("Qiniu marketplace session keys", () => {
  it("restores each mode's Key until the app session ends", () => {
    const session = renderHook(useQiniuMarketCredentials);

    act(() => session.result.current.setMode("token-plan"));
    act(() => session.result.current.setApiKey("sk-plan-only"));
    act(() => session.result.current.setMode("payg"));
    act(() => session.result.current.setApiKey("sk-payg-only"));

    act(() => session.result.current.setMode("token-plan"));
    expect(session.result.current.apiKey).toBe("sk-plan-only");
    act(() => session.result.current.setMode("payg"));
    expect(session.result.current.apiKey).toBe("sk-payg-only");

    session.unmount();
    const nextSession = renderHook(useQiniuMarketCredentials);
    expect(nextSession.result.current.apiKey).toBe("");
    act(() => nextSession.result.current.setMode("token-plan"));
    expect(nextSession.result.current.apiKey).toBe("");
  });

  it("clears only the active mode's Key", () => {
    const { result } = renderHook(useQiniuMarketCredentials);
    act(() => result.current.setApiKey("sk-payg-only"));
    act(() => result.current.setMode("token-plan"));
    act(() => result.current.setApiKey("sk-plan-only"));
    act(() => result.current.setApiKey(""));
    expect(result.current.apiKey).toBe("");
    act(() => result.current.setMode("payg"));
    expect(result.current.apiKey).toBe("sk-payg-only");
  });
});
