import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Box, LayoutGrid } from "lucide-react";
import type { QiniuMarketModel } from "@/lib/api/qiniuMarket";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function collectMarketVendors(models: QiniuMarketModel[]) {
  const vendors = new Map<
    string,
    { official: Set<string>; models: Set<string> }
  >();
  for (const model of models) {
    if (!model.vendor) continue;
    const icons = vendors.get(model.vendor) ?? {
      official: new Set<string>(),
      models: new Set<string>(),
    };
    if (model.vendorIcon) icons.official.add(model.vendorIcon);
    if (model.icon) icons.models.add(model.icon);
    vendors.set(model.vendor, icons);
  }
  return [...vendors]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, icons]) => ({
      name,
      // Stable across API ordering changes; prefer issuer avatars over model avatars.
      icons: [
        ...new Set([...icons.official].sort().concat([...icons.models].sort())),
      ],
    }));
}

function VendorAvatar({ sources }: { sources: string[] }) {
  const [index, setIndex] = useState(0);
  return (
    <span
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center"
      aria-hidden="true"
    >
      {sources[index] ? (
        <img
          src={sources[index]}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full object-contain"
          onError={() => setIndex((value) => value + 1)}
        />
      ) : (
        <Box className="h-4 w-4 text-muted-foreground" />
      )}
    </span>
  );
}

interface Props {
  models: QiniuMarketModel[];
  value: string;
  onValueChange: (value: string) => void;
  revision?: number;
}

export function MarketVendorSelect({
  models,
  value,
  onValueChange,
  revision = 0,
}: Props) {
  const { t } = useTranslation();
  const vendors = useMemo(() => collectMarketVendors(models), [models]);
  return (
    <Select
      value={value ? `vendor:${value}` : "all"}
      onValueChange={(next) =>
        onValueChange(next === "all" ? "" : next.slice(7))
      }
    >
      <SelectTrigger
        className="h-10 w-full min-w-0 sm:w-48 [&>span]:truncate"
        aria-label={t("marketplace.vendor", { defaultValue: "模型厂商" })}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-w-[min(18rem,90vw)]">
        <SelectItem value="all">
          <span className="inline-flex items-center gap-2">
            <LayoutGrid
              className="h-4 w-5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            {t("marketplace.allVendors", { defaultValue: "所有厂商" })}
          </span>
        </SelectItem>
        {vendors.map((vendor) => (
          <SelectItem key={vendor.name} value={`vendor:${vendor.name}`}>
            <span className="inline-flex items-center gap-2">
              <VendorAvatar
                key={JSON.stringify([vendor.icons, revision])}
                sources={vendor.icons}
              />
              <span className="truncate">{vendor.name}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
