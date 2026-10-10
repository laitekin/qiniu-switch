import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Form, FormLabel } from "@/components/ui/form";
import { ImeSafeInput } from "@/components/ui/ime-safe-input";
import type { ProviderFormData } from "@/lib/schemas/provider";
import { BasicFormFields } from "./BasicFormFields";
import type { ProviderFormProps } from "./ProviderForm";

/** A Harness route is one OpenAI-compatible endpoint with one or more models. */
export function DshProviderForm({
  initialData,
  onSubmit,
  onCancel,
  submitLabel,
  showButtons = true,
  onSubmittingChange,
  onSubmitReadyChange,
}: ProviderFormProps) {
  const { t } = useTranslation();
  const options = initialData?.settingsConfig?.options as
    | Record<string, string>
    | undefined;
  const models = initialData?.settingsConfig?.models as
    | Record<string, { name?: string }>
    | undefined;
  const [apiKey, setApiKey] = useState(options?.apiKey ?? "");
  const [baseUrl, setBaseUrl] = useState(
    options?.baseURL ?? "https://api.qnaigc.com/v1",
  );
  const [model, setModel] = useState(Object.keys(models ?? {})[0] ?? "");
  const [busy, setBusy] = useState(false);
  const form = useForm<ProviderFormData>({
    defaultValues: {
      name: initialData?.name ?? "",
      notes: initialData?.notes ?? "",
      websiteUrl: initialData?.websiteUrl ?? "https://www.qiniu.com/ai/models",
      icon: initialData?.icon ?? "deepseek",
      iconColor: initialData?.iconColor ?? "",
      settingsConfig: "{}",
    },
  });
  const ready = Boolean(
    form.watch("name")?.trim() &&
      apiKey.trim() &&
      baseUrl.trim() &&
      model.trim(),
  );
  useEffect(() => onSubmitReadyChange?.(ready), [ready, onSubmitReadyChange]);

  return (
    <Form {...form}>
      <form
        id="provider-form"
        className="space-y-6 rounded-xl border border-border p-6"
        onSubmit={form.handleSubmit(async (identity) => {
          if (!ready || busy) return;
          setBusy(true);
          onSubmittingChange?.(true);
          try {
            const modelId = model.trim();
            await onSubmit({
              ...identity,
              name: identity.name.trim(),
              presetCategory: initialData?.category ?? "custom",
              meta: initialData?.meta,
              settingsConfig: JSON.stringify({
                name: identity.name.trim(),
                api: "openai-completions",
                options: {
                  baseURL: baseUrl.trim().replace(/\/+$/, ""),
                  apiKey: apiKey.trim(),
                },
                models: {
                  [modelId]: models?.[modelId] ?? { name: modelId },
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
          <FormLabel htmlFor="dsh-api-key">API Key</FormLabel>
          <ImeSafeInput
            id="dsh-api-key"
            type="password"
            value={apiKey}
            onValueChange={setApiKey}
            placeholder="sk-..."
          />
        </div>
        <div className="space-y-2">
          <FormLabel htmlFor="dsh-base-url">
            {t("providerForm.apiEndpoint", { defaultValue: "API 端点" })}
          </FormLabel>
          <ImeSafeInput
            id="dsh-base-url"
            value={baseUrl}
            onValueChange={setBaseUrl}
          />
        </div>
        <div className="space-y-2">
          <FormLabel htmlFor="dsh-model">
            {t("provider.form.gemini.model", { defaultValue: "模型" })}
          </FormLabel>
          <ImeSafeInput
            id="dsh-model"
            value={model}
            onValueChange={setModel}
            placeholder="deepseek-v4-flash"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {t("dsh.configHint", {
            defaultValue:
              "Harness stores models in ~/.dsh/settings.yaml and API keys separately in ~/.dsh/.credentials.yaml.",
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
