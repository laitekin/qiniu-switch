import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  APP_IDS,
  APP_ICON_MAP,
  getAppLabel,
  isAdditiveAppId,
  isProxyAppId,
} from "@/config/appConfig";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { providersApi } from "@/lib/api/providers";
import { proxyApi } from "@/lib/api/proxy";
import type { AppId } from "@/lib/api/types";
import type { QiniuMarketModel } from "@/lib/api/qiniuMarket";
import type { Provider } from "@/types";
import { providerNeedsRouting } from "@/utils/providerCapabilities";
import {
  buildQiniuMarketProvider,
  marketModelSupportsApp,
} from "@/utils/qiniuMarketProvider";

interface Props {
  model: QiniuMarketModel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiKey: string;
  modelId: string;
  initialApp: AppId;
  onConfigured: (app: AppId, providerId: string) => void;
}

async function routingReady(app: AppId): Promise<boolean> {
  if (app === "claude-desktop")
    return (await proxyApi.getProxyStatus()).running;
  if (!isProxyAppId(app)) return false;
  const [status, takeover] = await Promise.all([
    proxyApi.getProxyStatus(),
    proxyApi.getProxyTakeoverStatus(),
  ]);
  return status.running && takeover[app] === true;
}

export function MarketConfigureDialog({
  model,
  open,
  onOpenChange,
  apiKey,
  modelId,
  initialApp,
  onConfigured,
}: Props) {
  const { t } = useTranslation();
  const [app, setApp] = useState<AppId>(initialApp);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [outcome, setOutcome] = useState<
    "" | "routing" | "save-error" | "apply-error"
  >("");
  const attempt = useRef<{
    app: AppId;
    provider: Provider;
    saved: boolean;
    uncertain: boolean;
  } | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    setApp(initialApp);
    setBusy(false);
    setSaved(false);
    setOutcome("");
    attempt.current = null;
    inFlight.current = false;
  }, [open, model?.id, modelId, apiKey, initialApp]);

  const finish = () => {
    const current = attempt.current;
    if (!current?.saved) return;
    onOpenChange(false);
    onConfigured(current.app, current.provider.id);
  };

  const configure = async () => {
    if (
      !model ||
      !modelId ||
      !apiKey.trim() ||
      !marketModelSupportsApp(model, app) ||
      inFlight.current
    )
      return;
    inFlight.current = true;
    setBusy(true);
    setOutcome("");
    try {
      attempt.current ??= {
        app,
        provider: buildQiniuMarketProvider(
          model,
          modelId,
          app,
          apiKey,
          `qiniu-market-${crypto.randomUUID()}`,
        ),
        saved: false,
        uncertain: false,
      };
      const current = attempt.current;
      // A failed IPC reply may still have saved the provider. Reuse its ID and
      // reconcile before retrying instead of creating another entry.
      if (current.uncertain) {
        const existing = await providersApi.getAll(current.app);
        current.saved = !!existing[current.provider.id];
        current.uncertain = false;
      }
      if (!current.saved) {
        current.uncertain = true;
        const added = await providersApi.add(
          current.provider,
          current.app,
          false,
        );
        if (!added) throw new Error("MARKET_SAVE_FAILED");
        current.saved = true;
        current.uncertain = false;
      }
      setSaved(true);
      if (providerNeedsRouting(current.app, current.provider)) {
        let ready = false;
        try {
          ready = await routingReady(current.app);
        } catch {
          /* Keep the saved provider for manual activation. */
        }
        if (!ready) {
          setOutcome("routing");
          return;
        }
      }
      const result = await providersApi.switch(
        current.provider.id,
        current.app,
      );
      if (result.warnings?.length) {
        toast.warning(
          t("marketplace.configuredWithWarnings", {
            defaultValue: "配置已写入，请在客户端配置页检查状态",
          }),
        );
      } else {
        toast.success(
          isAdditiveAppId(current.app)
            ? t("marketplace.configuredAdditive", {
                defaultValue: "已添加到客户端，请选择该模型",
              })
            : t("marketplace.configured", {
                defaultValue: "配置已应用，新会话中生效",
              }),
        );
      }
      finish();
    } catch {
      setOutcome(attempt.current?.saved ? "apply-error" : "save-error");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const supported = !!model && marketModelSupportsApp(model, app);
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value);
      }}
    >
      <DialogContent className="max-w-xl" zIndex="top">
        <DialogHeader>
          <DialogTitle>
            {t("marketplace.configureTitle", { defaultValue: "配置到客户端" })}
          </DialogTitle>
          <DialogDescription>
            {t("marketplace.configureDescription", {
              defaultValue: "新增七牛云配置，并写入所选客户端",
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto px-6 py-5">
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="font-medium">
              {t("marketplace.configureNew", {
                name: model?.name ?? "",
                defaultValue: "新增 七牛云 · {{name}}",
              })}
            </p>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
              {modelId}
            </p>
          </div>
          <div
            role="group"
            aria-label={t("marketplace.chooseClient", {
              defaultValue: "选择客户端",
            })}
            className="grid grid-cols-2 gap-2 sm:grid-cols-3"
          >
            {APP_IDS.map((id) => {
              const compatible = !!model && marketModelSupportsApp(model, id);
              return (
                <Button
                  key={id}
                  type="button"
                  variant={app === id ? "default" : "outline"}
                  size="sm"
                  className="h-auto min-h-10 justify-start gap-2 whitespace-normal text-left"
                  aria-pressed={app === id}
                  disabled={busy || saved || !!attempt.current || !compatible}
                  title={
                    !compatible
                      ? t("marketplace.unsupportedClient", {
                          defaultValue: "此模型暂不支持该客户端协议",
                        })
                      : undefined
                  }
                  onClick={() => setApp(id)}
                >
                  <span className="shrink-0" aria-hidden="true">
                    {APP_ICON_MAP[id].icon}
                  </span>
                  {getAppLabel(id)}
                </Button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("marketplace.configureRoutingHint", {
              defaultValue: "需要本地路由的客户端，未开启路由时仅保存配置",
            })}
          </p>
          {!supported && (
            <p className="text-sm text-muted-foreground">
              {t("marketplace.chooseSupportedClient", {
                defaultValue: "请选择支持此模型协议的客户端",
              })}
            </p>
          )}
          {(!apiKey.trim() || !modelId) && (
            <p className="text-sm text-destructive">
              {t("marketplace.chatNeedConnection", {
                defaultValue: "请先连接 API Key 并选择可用模型",
              })}
            </p>
          )}
          {outcome && (
            <p
              role={outcome === "routing" ? "status" : "alert"}
              className={`text-sm ${outcome === "routing" ? "text-muted-foreground" : "text-destructive"}`}
            >
              {outcome === "routing"
                ? t("marketplace.configSavedRouting", {
                    defaultValue:
                      "已保存。请在客户端配置页开启路由，再启用此配置",
                  })
                : outcome === "apply-error"
                  ? t("marketplace.configSavedApplyError", {
                      defaultValue:
                        "已保存，应用未完成。可重试，或到客户端配置页检查",
                    })
                  : t("marketplace.configSaveError", {
                      defaultValue: "保存未确认，请重试检查状态",
                    })}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => (saved ? finish() : onOpenChange(false))}
          >
            {saved
              ? t("marketplace.viewConfiguration", { defaultValue: "查看配置" })
              : t("marketplace.cancel", { defaultValue: "取消" })}
          </Button>
          {outcome !== "routing" && (
            <Button
              type="button"
              disabled={busy || !supported || !apiKey.trim() || !modelId}
              onClick={() => void configure()}
            >
              {busy && <Loader2 size={14} className="mr-2 animate-spin" />}
              {saved
                ? t("marketplace.retryApply", { defaultValue: "重试应用" })
                : t("marketplace.confirmConfiguration", {
                    defaultValue: "确认配置",
                  })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
