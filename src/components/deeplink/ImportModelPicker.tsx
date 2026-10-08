import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchModelsForConfig, type FetchedModel } from "@/lib/api/model-fetch";

interface Props {
  app?: string;
  baseUrl: string;
  apiKey: string;
  value?: string;
  disabled: boolean;
  onChange: (model: string) => void;
  onValidChange: (valid: boolean) => void;
}

export function ImportModelPicker({
  app,
  baseUrl,
  apiKey,
  value,
  disabled,
  onChange,
  onValidChange,
}: Props) {
  const { t } = useTranslation();
  const [models, setModels] = useState<FetchedModel[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const sequence = useRef(0);
  const valid =
    status === "ready" && models.some((model) => model.id === value);

  const fetchModels = useCallback(async () => {
    const current = ++sequence.current;
    onValidChange(false);
    setModels([]);
    setStatus("loading");
    try {
      // Qiniu's model catalog is shared by its protocol-specific endpoints.
      const result = await fetchModelsForConfig(
        baseUrl,
        apiKey,
        false,
        new URL("/v1/models", baseUrl).toString(),
      );
      if (current !== sequence.current) return;
      setModels(
        Array.from(
          new Map(
            result
              .filter((model) => model.id.trim())
              .map((model) => [model.id, model]),
          ).values(),
        ),
      );
      setStatus("ready");
    } catch {
      if (current === sequence.current) setStatus("error");
    }
  }, [baseUrl, apiKey, onValidChange]);

  useEffect(() => {
    void fetchModels();
    return () => {
      sequence.current += 1;
    };
  }, [app, fetchModels]);

  useEffect(() => {
    onValidChange(valid);
  }, [valid, onValidChange]);

  return (
    <div className="grid grid-cols-3 items-start gap-4">
      <label
        htmlFor="import-model"
        className="pt-2 font-medium text-sm text-muted-foreground"
      >
        {t("deeplink.model")}
      </label>
      <div className="col-span-2 min-w-0 space-y-2">
        <Select
          value={valid ? value : ""}
          onValueChange={onChange}
          disabled={disabled || status !== "ready" || !models.length}
        >
          <SelectTrigger
            id="import-model"
            className="min-w-0 [&>span]:truncate"
          >
            <SelectValue
              placeholder={t(
                status === "loading"
                  ? "providerForm.fetchingModels"
                  : "deeplink.selectFetchedModel",
              )}
            />
          </SelectTrigger>
          <SelectContent className="z-[120] max-w-[min(28rem,90vw)]">
            {models.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                <span className="break-all">{model.id}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {status === "error" && (
          <p role="alert" className="text-xs text-destructive">
            {t("providerForm.fetchModelsFailed")}
          </p>
        )}
        {status === "ready" && !models.length && (
          <p role="status" className="text-xs text-muted-foreground">
            {t("providerForm.fetchModelsEmpty")}
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || status === "loading"}
          onClick={() => void fetchModels()}
        >
          {t("providerForm.fetchModels")}
        </Button>
      </div>
    </div>
  );
}
