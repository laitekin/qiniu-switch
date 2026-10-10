import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchModelsForConfig, type FetchedModel } from "@/lib/api/model-fetch";
import type { QiniuMarketModel } from "@/lib/api/qiniuMarket";

export type MarketConnectionStatus = "idle" | "loading" | "ready" | "error";

const EMPTY_FETCHED_MODELS: FetchedModel[] = [];
const EMPTY_CATALOG_MODELS: QiniuMarketModel[] = [];

interface Props {
  apiKey: string;
  initialModels?: FetchedModel[];
  initialStatus?: MarketConnectionStatus;
  catalogModels?: QiniuMarketModel[];
  catalogReady?: boolean;
  onApiKeyChange: (key: string) => void;
  onModelsChange: (models: FetchedModel[]) => void;
  onStatusChange?: (status: MarketConnectionStatus) => void;
}

function excludeUnavailableModels(
  models: FetchedModel[],
  catalog: QiniuMarketModel[],
): FetchedModel[] {
  const unavailableIds = new Set(
    catalog
      .filter((model) => model.retired || !model.available)
      .flatMap((model) => [model.id, ...model.apiIds]),
  );
  return Array.from(
    new Map(
      models
        .filter((model) => model.id.trim() && !unavailableIds.has(model.id))
        .map((model) => [model.id, model]),
    ).values(),
  );
}

export function MarketConnection({
  apiKey,
  initialModels = EMPTY_FETCHED_MODELS,
  initialStatus,
  catalogModels = EMPTY_CATALOG_MODELS,
  catalogReady = true,
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
    () => excludeUnavailableModels(initialModels, catalogModels).length,
  );
  const sequence = useRef(0);
  const previousKey = useRef(apiKey);
  const callbacks = useRef({ onModelsChange, onStatusChange });
  callbacks.current = { onModelsChange, onStatusChange };

  useEffect(() => {
    if (previousKey.current !== apiKey) {
      previousKey.current = apiKey;
      sequence.current += 1;
      setStatus("idle");
      setCount(0);
      callbacks.current.onModelsChange([]);
      callbacks.current.onStatusChange?.("idle");
    }
    return () => {
      sequence.current += 1;
    };
  }, [apiKey]);

  useEffect(() => {
    setCount(excludeUnavailableModels(initialModels, catalogModels).length);
  }, [initialModels, catalogModels]);

  const connect = async () => {
    if (!apiKey.trim() || !catalogReady || status === "loading") return;
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
      const models = excludeUnavailableModels(result, catalogModels);
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
      <div className="flex flex-wrap items-center gap-3">
        <label
          htmlFor={inputId}
          className="flex shrink-0 items-center gap-2 text-sm font-medium"
        >
          <KeyRound size={16} aria-hidden="true" />
          {t("marketplace.apiKey", { defaultValue: "模型 API Key" })}
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
          disabled={!apiKey.trim() || !catalogReady || status === "loading"}
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
      {status === "ready" && (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          {count
            ? t("marketplace.connectedModels", {
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
