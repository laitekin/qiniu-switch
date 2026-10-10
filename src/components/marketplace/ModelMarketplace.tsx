import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  ArrowUpRight,
  Box,
  Loader2,
  MessageSquare,
  Monitor,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { settingsApi } from "@/lib/api/settings";
import { qiniuMarketApi, type QiniuMarketModel } from "@/lib/api/qiniuMarket";
import { cn } from "@/lib/utils";
import { DRAG_REGION_ATTR, DRAG_REGION_STYLE } from "@/lib/platform";
import { APP_IDS } from "@/config/appConfig";
import { marketModelSupportsApp } from "@/utils/qiniuMarketProvider";
import { isTokenPlanModel, type QiniuKeyMode } from "@/utils/qiniuTokenPlan";
import { MarketMarkdown } from "./MarketMarkdown";
import { MarketVendorSelect } from "./MarketVendorSelect";

interface ModelMarketplaceProps {
  onConfigure: (model: QiniuMarketModel) => void;
  onChat: (model: QiniuMarketModel) => void;
  keyMode?: QiniuKeyMode;
  planModelIds?: string[];
  planStatus?: "loading" | "ready" | "error";
  onPlanRefresh?: () => void;
  connection?:
    | ReactNode
    | ((models: QiniuMarketModel[], ready: boolean) => ReactNode);
}

const EMPTY_PLAN_MODEL_IDS: string[] = [];

function canConfigureModel(model: QiniuMarketModel) {
  return APP_IDS.some((app) => marketModelSupportsApp(model, app));
}

function ModelIcon({ model }: { model: QiniuMarketModel }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border-default bg-background p-2">
      {model.icon && !failed ? (
        <img
          src={model.icon}
          alt=""
          className="h-full w-full object-contain"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <Box className="h-6 w-6 text-blue-500" aria-hidden="true" />
      )}
    </span>
  );
}

function ModelPrices({
  model,
  compact = false,
  planMode = false,
}: {
  model: QiniuMarketModel;
  compact?: boolean;
  planMode?: boolean;
}) {
  const { t } = useTranslation();
  const prices = compact ? model.prices.slice(0, 2) : model.prices;
  if (planMode && compact) {
    return (
      <p className="text-xs text-muted-foreground">
        {t("marketplace.planPricing", {
          defaultValue: "Token Plan 按套餐积分扣减，以控制台为准",
        })}
      </p>
    );
  }
  const range = (value?: number[]) => {
    if (
      !value ||
      value.length !== 2 ||
      (value[0] === 0 && value[1] >= 99999999)
    )
      return undefined;
    return value[1] >= 99999999
      ? `≥ ${value[0].toLocaleString()} tokens`
      : `${value[0].toLocaleString()}–${value[1].toLocaleString()} tokens`;
  };
  if (!prices.length) {
    return (
      <p className="text-xs text-muted-foreground">
        {planMode
          ? t("marketplace.planPricing", {
              defaultValue: "Token Plan 按套餐积分扣减，以控制台为准",
            })
          : t("marketplace.priceUnavailable", {
              defaultValue: "价格以官网为准",
            })}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {planMode && (
        <p className="text-xs text-muted-foreground">
          {t("marketplace.planPaygReference", {
            defaultValue: "套餐按积分扣减；下方仅为按量参考价。",
          })}
        </p>
      )}
      <dl
        className={cn("flex flex-wrap gap-x-4 gap-y-2", !compact && "flex-col")}
      >
        {prices.map((price, index) => (
          <div
            key={`${price.label}-${index}`}
            className="flex flex-wrap items-baseline gap-1 text-xs"
          >
            <dt className="text-muted-foreground">{price.label}</dt>
            <dd className="font-medium text-orange-600 dark:text-orange-400">
              {price.value}
              {price.unit ? ` / ${price.unit}` : ""}
            </dd>
            {!compact &&
              (range(price.inputRange) || range(price.outputRange)) && (
                <dd className="w-full text-[11px] text-muted-foreground">
                  {range(price.inputRange) &&
                    `${t("marketplace.inputRange", { defaultValue: "输入" })}: ${range(price.inputRange)}`}
                  {range(price.inputRange) && range(price.outputRange) && " · "}
                  {range(price.outputRange) &&
                    `${t("marketplace.outputRange", { defaultValue: "输出" })}: ${range(price.outputRange)}`}
                </dd>
              )}
          </div>
        ))}
      </dl>
      {compact &&
        (model.prices.length > 2 ||
          model.prices.some(
            (price) => range(price.inputRange) || range(price.outputRange),
          )) && (
          <p className="text-[11px] text-muted-foreground">
            {t("marketplace.pricingDetails", {
              defaultValue: "完整计费见详情",
            })}
          </p>
        )}
    </div>
  );
}

function ModelActions({
  model,
  onConfigure,
  onChat,
}: Pick<ModelMarketplaceProps, "onConfigure" | "onChat"> & {
  model: QiniuMarketModel;
}) {
  const { t } = useTranslation();
  const chatSupported = model.available && !model.retired && model.supportsChat;
  const configurationSupported = canConfigureModel(model);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="min-w-0 flex-1"
        disabled={!chatSupported}
        onClick={() => onChat(model)}
        title={
          !chatSupported
            ? t("marketplace.chatUnsupported", {
                defaultValue: "此模型暂不支持应用内对话",
              })
            : undefined
        }
      >
        <MessageSquare className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {t("marketplace.try", { defaultValue: "立即体验" })}
      </Button>
      <Button
        size="sm"
        className="min-w-0 flex-1"
        disabled={!configurationSupported}
        onClick={() => onConfigure(model)}
        title={
          !configurationSupported
            ? t("marketplace.configurationUnsupported", {
                defaultValue: "此模型暂无兼容客户端",
              })
            : undefined
        }
      >
        <Monitor className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {t("marketplace.configure", { defaultValue: "配置到客户端" })}
      </Button>
    </>
  );
}

function ModelCard({
  model,
  featured,
  planMode,
  onDetail,
  onConfigure,
  onChat,
}: Pick<ModelMarketplaceProps, "onConfigure" | "onChat"> & {
  model: QiniuMarketModel;
  featured?: boolean;
  planMode: boolean;
  onDetail: (model: QiniuMarketModel) => void;
}) {
  const { t } = useTranslation();
  return (
    <article
      aria-label={model.name}
      className={cn(
        "flex min-w-0 flex-col rounded-xl border border-border-default bg-background p-5 shadow-sm transition-colors hover:border-blue-400/60",
        featured && "border-blue-300/60 dark:border-blue-700/60",
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-md"
        onClick={() => onDetail(model)}
        aria-label={t("marketplace.viewModel", {
          defaultValue: "查看 {{name}} 详情",
          name: model.name,
        })}
      >
        <div className="flex w-full min-w-0 items-center gap-3">
          <ModelIcon model={model} />
          <div className="min-w-0 flex-1">
            <h3 className="break-words text-sm font-semibold leading-5">
              {model.name}
            </h3>
            {model.vendor && (
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {model.vendor}
              </p>
            )}
          </div>
          {model.isNew && (
            <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-blue-950/60 dark:text-blue-300">
              {t("marketplace.new", { defaultValue: "新上架" })}
            </span>
          )}
          {planMode && (
            <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-blue-950/60 dark:text-blue-300">
              Token Plan
            </span>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {model.capabilities.slice(0, 4).map((capability) => (
            <span
              key={capability}
              className="rounded bg-muted/60 px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              {capability}
            </span>
          ))}
        </div>
        <p className="my-3 line-clamp-3 min-h-[3.75rem] text-xs leading-5 text-muted-foreground">
          {model.description ||
            t("marketplace.descriptionUnavailable", {
              defaultValue: "暂无模型简介",
            })}
        </p>
      </button>
      <div className="mt-auto border-t border-border-default pt-3">
        <ModelPrices model={model} compact planMode={planMode} />
        <div className="mt-4 flex flex-wrap gap-2">
          <ModelActions
            model={model}
            onConfigure={onConfigure}
            onChat={onChat}
          />
        </div>
      </div>
    </article>
  );
}

export function ModelMarketplace({
  onConfigure,
  onChat,
  connection,
  keyMode = "payg",
  planModelIds = EMPTY_PLAN_MODEL_IDS,
  planStatus = "ready",
  onPlanRefresh,
}: ModelMarketplaceProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [vendor, setVendor] = useState("");
  const [capability, setCapability] = useState("");
  const [selected, setSelected] = useState<QiniuMarketModel | null>(null);
  const previousMode = useRef(keyMode);
  useEffect(() => {
    if (previousMode.current !== keyMode) {
      previousMode.current = keyMode;
      setQuery("");
      setVendor("");
      setCapability("");
      setSelected(null);
    }
  }, [keyMode]);
  const catalog = useQuery({
    queryKey: ["qiniu", "model-market"],
    queryFn: qiniuMarketApi.list,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const detail = useQuery({
    queryKey: ["qiniu", "model-market-detail", selected?.id],
    queryFn: () => qiniuMarketApi.detail(selected!.id),
    enabled: !!selected,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const detailModel = detail.data ?? selected;
  const models = catalog.data?.models ?? [];
  const planMode = keyMode === "token-plan";
  const visibleModels = useMemo(
    () =>
      planMode
        ? planStatus === "ready"
          ? models.filter((model) => isTokenPlanModel(model, planModelIds))
          : []
        : models,
    [models, planMode, planStatus, planModelIds],
  );
  const planLoading = planMode && planStatus === "loading";
  const planError = planMode && planStatus === "error";
  const vendors = useMemo(
    () =>
      [
        ...new Set(visibleModels.map((model) => model.vendor).filter(Boolean)),
      ].sort(),
    [visibleModels],
  );
  const capabilities = useMemo(
    () => [...new Set(visibleModels.flatMap((model) => model.capabilities))],
    [visibleModels],
  );
  useEffect(() => {
    if (catalog.data && vendor && !vendors.includes(vendor)) setVendor("");
  }, [catalog.data, vendor, vendors]);
  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    return visibleModels.filter(
      (model) =>
        (!vendor || model.vendor === vendor) &&
        (!capability || model.capabilities.includes(capability)) &&
        (!keyword ||
          [
            model.id,
            model.name,
            model.description,
            model.vendor,
            ...model.capabilities,
          ]
            .join(" ")
            .toLocaleLowerCase()
            .includes(keyword)),
    );
  }, [visibleModels, query, vendor, capability]);
  const hasFilters = !!(query.trim() || vendor || capability);
  const available = filtered.filter(
    (model) => model.available && !model.retired,
  );
  const arrivals = hasFilters
    ? []
    : available.filter((model) => model.isNew).slice(0, 2);
  const remaining = available.filter((model) => !arrivals.includes(model));
  const retired = filtered.filter((model) => model.retired);
  const unavailable = filtered.filter(
    (model) => !model.available && !model.retired,
  );

  const renderCard = (model: QiniuMarketModel, featured = false) => (
    <ModelCard
      key={model.id}
      model={model}
      featured={featured}
      planMode={planMode}
      onDetail={setSelected}
      onConfigure={onConfigure}
      onChat={onChat}
    />
  );
  return (
    <section
      className="min-h-full bg-gradient-to-b from-blue-50/55 via-background to-background px-6 pb-8 dark:from-blue-950/15"
      aria-labelledby="model-market-title"
    >
      <div
        className="-mx-6 h-6"
        {...DRAG_REGION_ATTR}
        style={DRAG_REGION_STYLE as React.CSSProperties}
      />
      <div className="mx-auto max-w-[1440px] space-y-6">
        <div
          className="flex flex-wrap items-start justify-between gap-4"
          {...DRAG_REGION_ATTR}
          style={DRAG_REGION_STYLE as React.CSSProperties}
        >
          <div {...DRAG_REGION_ATTR}>
            <h1
              id="model-market-title"
              className="text-2xl font-semibold tracking-tight"
              {...DRAG_REGION_ATTR}
            >
              {t("marketplace.title", { defaultValue: "AI 大模型广场" })}
            </h1>
            <p
              className="mt-2 text-sm text-muted-foreground"
              {...DRAG_REGION_ATTR}
            >
              {t("marketplace.subtitle", {
                defaultValue: "发现模型，体验并配置到你的客户端。",
              })}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            disabled={catalog.isFetching || planLoading}
            onClick={() => {
              void catalog.refetch();
              if (planMode) onPlanRefresh?.();
            }}
          >
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5",
                catalog.isFetching && "animate-spin",
              )}
              aria-hidden="true"
            />
            {t("marketplace.refresh", { defaultValue: "刷新模型" })}
          </Button>
        </div>
        {typeof connection === "function"
          ? connection(
              visibleModels,
              catalog.isSuccess && (!planMode || planStatus === "ready"),
            )
          : connection}
        {planError && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300"
          >
            {t("marketplace.planLoadError", {
              defaultValue: "Token Plan 模型清单加载失败，请重试。",
            })}
            <Button
              variant="ghost"
              size="sm"
              onClick={onPlanRefresh}
              className="ml-2"
            >
              {t("common.retry", { defaultValue: "重试" })}
            </Button>
          </div>
        )}
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-10 pl-9"
                placeholder={t("marketplace.search", {
                  defaultValue: "搜索模型名称、能力…",
                })}
                aria-label={t("marketplace.search", {
                  defaultValue: "搜索模型名称、能力…",
                })}
              />
            </div>
            <MarketVendorSelect
              models={models}
              value={vendor}
              onValueChange={setVendor}
              revision={catalog.dataUpdatedAt}
            />
          </div>
          {!!capabilities.length && (
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label={t("marketplace.capabilities", {
                defaultValue: "模型能力",
              })}
            >
              {["", ...capabilities].map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={item === capability}
                  onClick={() => setCapability(item)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                    item === capability
                      ? "bg-blue-500 text-white"
                      : "border border-border-default bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item || t("marketplace.all", { defaultValue: "全部" })}
                </button>
              ))}
            </div>
          )}
        </div>
        {catalog.isError && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300"
          >
            {t("marketplace.loadError", {
              defaultValue: "模型列表加载失败，请重试。",
            })}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void catalog.refetch()}
              className="ml-2"
            >
              {t("common.retry", { defaultValue: "重试" })}
            </Button>
          </div>
        )}
        {catalog.isPending || planLoading ? (
          <div
            role="status"
            className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"
          >
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            {planLoading
              ? t("marketplace.planLoading", {
                  defaultValue: "正在获取 Token Plan 模型…",
                })
              : t("marketplace.loading", { defaultValue: "正在获取七牛模型…" })}
          </div>
        ) : planError ? null : (
          <>
            {arrivals.length > 0 && (
              <section
                className="rounded-xl border border-blue-100 bg-blue-50/30 p-4 dark:border-blue-900/40 dark:bg-blue-950/10"
                aria-labelledby="market-new-models"
              >
                <h2
                  id="market-new-models"
                  className="mb-4 flex items-center gap-2 text-sm font-semibold"
                >
                  <Sparkles
                    className="h-4 w-4 text-blue-500"
                    aria-hidden="true"
                  />
                  {t("marketplace.arrivals", { defaultValue: "新上架模型" })}
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {arrivals.map((model) => renderCard(model, true))}
                </div>
              </section>
            )}
            <div className="flex items-center justify-between gap-3 text-sm">
              <h2 className="font-medium">
                {t("marketplace.explore", { defaultValue: "探索模型" })}{" "}
                <span className="ml-2 font-normal text-muted-foreground">
                  {available.length}
                </span>
              </h2>
              {hasFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setVendor("");
                    setCapability("");
                  }}
                >
                  {t("marketplace.clearFilters", { defaultValue: "清除筛选" })}
                </Button>
              )}
            </div>
            {available.length === 0 && !catalog.isError ? (
              <p
                role="status"
                className="py-16 text-center text-sm text-muted-foreground"
              >
                {t("marketplace.empty", { defaultValue: "未找到匹配的模型" })}
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {remaining.map((model) => renderCard(model))}
              </div>
            )}
            {retired.length > 0 && (
              <details className="rounded-xl border border-border-default bg-background p-4">
                <summary className="cursor-pointer text-sm text-muted-foreground">
                  {t("marketplace.retired", { defaultValue: "已退役模型" })} ·{" "}
                  {retired.length}
                </summary>
                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {retired.map((model) => renderCard(model))}
                </div>
              </details>
            )}
            {unavailable.length > 0 && (
              <details className="rounded-xl border border-border-default bg-background p-4">
                <summary className="cursor-pointer text-sm text-muted-foreground">
                  {t("marketplace.unavailable", {
                    defaultValue: "暂不可用模型",
                  })}{" "}
                  · {unavailable.length}
                </summary>
                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {unavailable.map((model) => renderCard(model))}
                </div>
              </details>
            )}
          </>
        )}
        <p className="text-center text-xs text-muted-foreground">
          {planMode
            ? t("marketplace.planSource", {
                defaultValue:
                  "套餐清单来自七牛官网，实际权限与积分以你的订阅专用 Key 和控制台为准。",
              })
            : t("marketplace.source", {
                defaultValue:
                  "模型信息来自七牛云，实际可用模型以你的 API Key 为准。",
              })}
        </p>
      </div>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        {detailModel && (
          <DialogContent className="max-w-2xl" zIndex="top">
            <DialogHeader className="relative pr-14">
              <div className="flex items-center gap-3">
                <ModelIcon key={detailModel.id} model={detailModel} />
                <div className="min-w-0">
                  <DialogTitle className="break-words">
                    {detailModel.name}
                  </DialogTitle>
                  <DialogDescription className="mt-1 break-all">
                    {detailModel.id}
                  </DialogDescription>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-3 top-3"
                onClick={() => setSelected(null)}
                aria-label={t("common.close", { defaultValue: "关闭" })}
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogHeader>
            <div className="min-h-0 space-y-6 overflow-y-auto px-6 py-5">
              {detail.isFetching && (
                <p
                  role="status"
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin"
                    aria-hidden="true"
                  />
                  {t("marketplace.loadingDetail", {
                    defaultValue: "正在获取模型详情…",
                  })}
                </p>
              )}
              {detail.isError && (
                <div
                  role="alert"
                  className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
                >
                  {t("marketplace.detailError", {
                    defaultValue: "详情暂时不可用，显示模型列表信息。",
                  })}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void detail.refetch()}
                  >
                    {t("common.retry", { defaultValue: "重试" })}
                  </Button>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {detailModel.capabilities.map((item) => (
                  <span
                    key={item}
                    className="rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-600 dark:bg-blue-950/60 dark:text-blue-300"
                  >
                    {item}
                  </span>
                ))}
              </div>
              <p className="whitespace-pre-wrap break-words text-sm leading-7">
                {detailModel.description ||
                  t("marketplace.descriptionUnavailable", {
                    defaultValue: "暂无模型简介",
                  })}
              </p>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-3 text-sm">
                {detailModel.vendor && (
                  <>
                    <dt className="text-muted-foreground">
                      {t("marketplace.vendor", { defaultValue: "模型厂商" })}
                    </dt>
                    <dd>{detailModel.vendor}</dd>
                  </>
                )}
                {detailModel.contextWindow && (
                  <>
                    <dt className="text-muted-foreground">
                      {t("marketplace.contextWindow", {
                        defaultValue: "上下文长度",
                      })}
                    </dt>
                    <dd>{detailModel.contextWindow}</dd>
                  </>
                )}
                {detailModel.maxOutput && (
                  <>
                    <dt className="text-muted-foreground">
                      {t("marketplace.maxOutput", { defaultValue: "最大输出" })}
                    </dt>
                    <dd>{detailModel.maxOutput}</dd>
                  </>
                )}
              </dl>
              <div className="space-y-3 border-t border-border-default pt-4">
                <h3 className="text-sm font-medium">
                  {planMode
                    ? t("marketplace.planPriceTitle", {
                        defaultValue: "套餐积分与按量参考价",
                      })
                    : t("marketplace.pricing", { defaultValue: "模型价格" })}
                </h3>
                <ModelPrices model={detailModel} planMode={planMode} />
              </div>
              {detailModel.announcement && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-800 dark:bg-amber-950/20">
                  <MarketMarkdown content={detailModel.announcement} />
                </div>
              )}
              {detailModel.overview && (
                <div className="border-t border-border-default pt-4">
                  <MarketMarkdown content={detailModel.overview} />
                </div>
              )}
              {detailModel.integrationDoc && (
                <details className="rounded-lg border border-border-default p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    {t("marketplace.integration", { defaultValue: "接入说明" })}
                  </summary>
                  <div className="mt-3">
                    <MarketMarkdown content={detailModel.integrationDoc} />
                  </div>
                </details>
              )}
              {(!detailModel.available ||
                detailModel.retired ||
                !detailModel.supportsChat) && (
                <p className="rounded-lg bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">
                  {canConfigureModel(detailModel)
                    ? t("marketplace.chatUnsupported", {
                        defaultValue: "此模型暂不支持应用内对话",
                      })
                    : t("marketplace.mediaHint", {
                        defaultValue: "此模型暂不支持应用内对话和客户端配置",
                      })}
                </p>
              )}
              {detailModel.detailUrl && (
                <Button
                  variant="link"
                  className="h-auto p-0 text-xs"
                  onClick={() =>
                    void settingsApi.openExternal(detailModel.detailUrl!)
                  }
                >
                  {t("marketplace.officialDetails", {
                    defaultValue: "七牛官网详情",
                  })}
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              )}
            </div>
            <DialogFooter>
              <ModelActions
                model={detailModel}
                onChat={(model) => {
                  setSelected(null);
                  onChat(model);
                }}
                onConfigure={(model) => {
                  setSelected(null);
                  onConfigure(model);
                }}
              />
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </section>
  );
}
