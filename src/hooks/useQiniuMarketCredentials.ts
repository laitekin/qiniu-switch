import { useCallback, useState } from "react";
import type { QiniuKeyMode } from "@/utils/qiniuTokenPlan";

/** Keep each Key in memory for this app session, never in local storage. */
export function useQiniuMarketCredentials() {
  const [mode, setMode] = useState<QiniuKeyMode>("payg");
  const [keys, setKeys] = useState<Record<QiniuKeyMode, string>>({
    payg: "",
    "token-plan": "",
  });
  const setApiKey = useCallback(
    (key: string) => setKeys((current) => ({ ...current, [mode]: key })),
    [mode],
  );

  return { mode, setMode, apiKey: keys[mode], setApiKey };
}
