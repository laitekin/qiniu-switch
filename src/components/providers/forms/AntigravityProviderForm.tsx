import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { FormLabel } from "@/components/ui/form";
import { ImeSafeInput } from "@/components/ui/ime-safe-input";
import type { ProviderFormData } from "@/lib/schemas/provider";
import { BasicFormFields } from "./BasicFormFields";
import type { ProviderFormProps } from "./ProviderForm";

export function AntigravityProviderForm({
  initialData,
  onSubmit,
  onCancel,
  submitLabel,
  showButtons = true,
  onSubmittingChange,
  onSubmitReadyChange,
}: ProviderFormProps) {
  const { t } = useTranslation();
  const initialEnv =
    (initialData?.settingsConfig?.env as Record<string, unknown> | undefined) ??
    {};
  const [apiKey, setApiKey] = useState(
    typeof initialEnv.GEMINI_API_KEY === "string"
      ? initialEnv.GEMINI_API_KEY
      : "",
  );
  const [baseUrl, setBaseUrl] = useState(
    typeof initialEnv.GOOGLE_GEMINI_BASE_URL === "string"
      ? initialEnv.GOOGLE_GEMINI_BASE_URL
      : "https://generativelanguage.googleapis.com",
  );
  const [model, setModel] = useState(
    typeof initialEnv.GEMINI_MODEL === "string" ? initialEnv.GEMINI_MODEL : "",
  );
  const [busy, setBusy] = useState(false);
  const form = useForm<ProviderFormData>({
    defaultValues: {
      name: initialData?.name ?? "",
      notes: initialData?.notes ?? "",
      websiteUrl: initialData?.websiteUrl ?? "https://antigravity.google/",
      icon: initialData?.icon ?? "antigravity",
      iconColor: initialData?.iconColor ?? "",
      settingsConfig: "{}",
    },
  });
  const ready = Boolean(
    form.watch("name")?.trim() && apiKey.trim() && baseUrl.trim(),
  );

  useEffect(() => onSubmitReadyChange?.(ready), [ready, onSubmitReadyChange]);

  return (
    <Form {...form}>
      <form
        id="provider-form"
        className="space-y-6 glass rounded-xl p-6 border border-white/10"
        onSubmit={form.handleSubmit(async (identity) => {
          if (!ready || busy) return;
          setBusy(true);
          onSubmittingChange?.(true);
          try {
            await onSubmit({
              ...identity,
              name: identity.name.trim(),
              presetCategory: initialData?.category ?? "custom",
              meta: initialData?.meta,
              settingsConfig: JSON.stringify({
                settings: { modelProvider: "gemini" },
                env: {
                  GEMINI_API_KEY: apiKey.trim(),
                  GOOGLE_GEMINI_BASE_URL: baseUrl.trim().replace(/\/+$/, ""),
                  ...(model.trim() ? { GEMINI_MODEL: model.trim() } : {}),
                },
              }),
            });
          } finally {
            setBusy(false);
            onSubmittingChange?.(false);
          }
        })}
      >
        <BasicFormFields form={form} />
        <div className="space-y-2">
          <FormLabel htmlFor="antigravity-api-key">API Key</FormLabel>
          <ImeSafeInput
            id="antigravity-api-key"
            type="password"
            value={apiKey}
            onValueChange={setApiKey}
            placeholder="GEMINI_API_KEY"
          />
        </div>
        <div className="space-y-2">
          <FormLabel htmlFor="antigravity-base-url">
            {t("providerForm.apiEndpoint", { defaultValue: "API 端点" })}
          </FormLabel>
          <ImeSafeInput
            id="antigravity-base-url"
            value={baseUrl}
            onValueChange={setBaseUrl}
            placeholder="https://your-gemini-compatible-endpoint.example"
          />
        </div>
        <div className="space-y-2">
          <FormLabel htmlFor="antigravity-model">
            {t("provider.form.gemini.model", { defaultValue: "模型" })}
          </FormLabel>
          <ImeSafeInput
            id="antigravity-model"
            value={model}
            onValueChange={setModel}
            placeholder="Gemini 3.6 Flash"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {t("antigravity.envHint", {
            defaultValue:
              "Antigravity CLI 从进程环境读取 API Key 和自定义端点；Qiniu Switch 不会修改 shell 配置文件。",
          })}
        </p>
        {showButtons && (
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={busy}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!ready || busy}>
              {submitLabel}
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
}
