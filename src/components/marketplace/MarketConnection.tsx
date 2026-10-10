import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchModelsForConfig, type FetchedModel } from "@/lib/api/model-fetch";
import type { QiniuMarketModel } from "@/lib/api/qiniuMarket";
import { settingsApi } from "@/lib/api/settings";
import { usableModelsForKey, type QiniuKeyMode } from "@/utils/qiniuTokenPlan";

export type MarketConnectionStatus = "idle" | "loading" | "ready" | "error";

const EMPTY_FETCHED_MODELS: FetchedModel[] = [];
const EMPTY_CATALOG_MODELS: QiniuMarketModel[] = [];
const EMPTY_PLAN_IDS: string[] = [];

interface Props {
  apiKey: string;
  initialModels?: FetchedModel[];
  initialStatus?: MarketConnectionStatus;
  catalogModels?: QiniuMarketModel[];
  catalogReady?: boolean;
  keyMode?: QiniuKeyMode;
  planModelIds?: string[];
  planReady?: boolean;
  onModeChange?: (mode: QiniuKeyMode) => void;
  onApiKeyChange: (key: string) => void;
  onModelsChange: (models: FetchedModel[]) => void;
  onStatusChange?: (status: MarketConnectionStatus) => void;
}

export function MarketConnection({
  apiKey,
  initialModels = EMPTY_FETCHED_MODELS,
  initialStatus,
  catalogModels = EMPTY_CATALOG_MODELS,
  catalogReady = true,
  keyMode = "payg",
  planModelIds = EMPTY_PLAN_IDS,
  planReady = true,
  onModeChange,
  onApiKeyChange,
  onModelsChange,
  onStatusChange,
}: Props) {
  const { t } = useTranslation();
  const inputId = useId();
  const [status, setStatus] = useState<MarketConnectionStatus>(
    initialStatus === "loading"
      ? "idle"
      : (initialStatus ?? (initialModels.length ? "ready" : "idle")),
  );
  const [count, setCount] = useState(
    () =>
      usableModelsForKey(initialModels, catalogModels, keyMode, planModelIds)
        .length,
  );
  const sequence = useRef(0);
  const previousKey = useRef(apiKey);
  const previousMode = useRef(keyMode);
  const callbacks = useRef({ onModelsChange, onStatusChange });
  callbacks.current = { onModelsChange, onStatusChange };

  useEffect(() => {
    if (previousKey.current !== apiKey || previousMode.current !== keyMode) {
      previousKey.current = apiKey;
      previousMode.current = keyMode;
      sequence.current += 1;
      setStatus("idle");
      setCount(0);
      callbacks.current.onModelsChange([]);
      callbacks.current.onStatusChange?.("idle");
    }
    return () => {
      sequence.current += 1;
    };
  }, [apiKey, keyMode]);

  useEffect(() => {
    setCount(
      usableModelsForKey(initialModels, catalogModels, keyMode, planModelIds)
        .length,
    );
  }, [initialModels, catalogModels, keyMode, planModelIds]);

  const connect = async () => {
    if (
      !apiKey.trim() ||
      !catalogReady ||
      (keyMode === "token-plan" && !planReady) ||
      status === "loading"
    )
      return;
    const current = ++sequence.current;
    setStatus("loading");
    callbacks.current.onStatusChange?.("loading");
    callbacks.current.onModelsChange([]);
    try {
      const result = await fetchModelsForConfig(
        "https://api.qnaigc.com/v1",
        apiKey.trim(),
        false,
        "https://api.qnaigc.com/v1/models",
      );
      if (current !== sequence.current) return;
      const models = usableModelsForKey(
        result,
        catalogModels,
        keyMode,
        planModelIds,
      );
      setCount(models.length);
      setStatus("ready");
      callbacks.current.onModelsChange(models);
      callbacks.current.onStatusChange?.("ready");
    } catch {
      if (current !== sequence.current) return;
      setStatus("error");
      callbacks.current.onStatusChange?.("error");
    }
  };

  return (
    <div className="rounded-xl border border-border-default bg-background p-4">
      {onModeChange && (
        <div
          role="group"
          aria-label={t("marketplace.keyMode", {
            defaultValue: "API Key 类型",
          })}
          className="mb-4 flex flex-wrap gap-2"
        >
          {(["payg", "token-plan"] as const).map((mode) => (
            <Button
              key={mode}
              type="button"
              size="sm"
              variant={keyMode === mode ? "default" : "outline"}
              aria-pressed={keyMode === mode}
              onClick={() => onModeChange(mode)}
            >
              {mode === "payg"
                ? t("marketplace.paygMode", { defaultValue: "按量 API" })
                : "Token Plan"}
            </Button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <label
          htmlFor={inputId}
          className="flex shrink-0 items-center gap-2 text-sm font-medium"
        >
          <KeyRound size={16} aria-hidden="true" />
          {keyMode === "token-plan"
            ? t("marketplace.planApiKey", {
                defaultValue: "订阅专用 API Key",
              })
            : t("marketplace.apiKey", { defaultValue: "模型 API Key" })}
        </label>
        <Input
          id={inputId}
          type="password"
          value={apiKey}
          onChange={(event) => onApiKeyChange(event.target.value)}
          placeholder="sk-…"
          autoComplete="off"
          spellCheck={false}
          maxLength={256}
          className="min-w-[12rem] flex-1 sm:max-w-sm"
        />
        <Button
          type="button"
          size="sm"
          onClick={() => void connect()}
          disabled={
            !apiKey.trim() ||
            !catalogReady ||
            (keyMode === "token-plan" && !planReady) ||
            status === "loading"
          }
        >
          {status === "loading" && (
            <Loader2
              size={14}
              className="mr-2 animate-spin"
              aria-hidden="true"
            />
          )}
          {status === "ready"
            ? t("marketplace.refreshModels", { defaultValue: "刷新模型" })
            : t("marketplace.connect", { defaultValue: "连接" })}
        </Button>
        {apiKey && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onApiKeyChange("")}
          >
            {t("marketplace.disconnect", { defaultValue: "清除 Key" })}
          </Button>
        )}
        <span className="text-xs text-muted-foreground">
          {t("marketplace.sessionKey", { defaultValue: "仅本次会话使用" })}
        </span>
      </div>
      {keyMode === "token-plan" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            {t("marketplace.planKeyHint", {
              defaultValue:
                "请使用订阅专用 Key。此处按官网套餐模型筛选，实际权益与积分以七牛控制台为准。",
            })}
          </span>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() =>
              void settingsApi.openExternal(
                "https://portal.qiniu.com/ai-inference/subscription?tier=Enterprise-s",
              )
            }
          >
            {t("marketplace.viewPlan", { defaultValue: "查看套餐" })}
          </Button>
        </div>
      )}
      {status === "ready" && (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          {count
            ? keyMode === "token-plan"
              ? t("marketplace.connectedPlanModels", {
                  count,
                  defaultValue: "已连接 · {{count}} 个套餐清单匹配模型",
                })
              : t("marketplace.connectedModels", {
                  count,
                  defaultValue: "已连接 · {{count}} 个可用模型",
                })
            : t("marketplace.emptyAvailableModels", {
                defaultValue: "已连接，暂无可用模型",
              })}
        </p>
      )}
      {status === "error" && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {t("marketplace.connectionFailed", {
            defaultValue: "连接失败，请检查 API Key 后重试",
          })}
        </p>
      )}
    </div>
  );
}
