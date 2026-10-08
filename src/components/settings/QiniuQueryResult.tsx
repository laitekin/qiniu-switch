import { Fragment, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, Clock3, Database, KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type DataRow = Record<string, unknown>;
const isRecord = (value: unknown): value is DataRow =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isEmpty = (value: unknown) =>
  value == null ||
  value === "" ||
  (Array.isArray(value) && value.length === 0) ||
  (isRecord(value) && Object.keys(value).length === 0);

export function QiniuQueryResult({
  value,
  operation,
  checkedAt,
}: {
  value: unknown;
  operation: string;
  checkedAt: string;
}) {
  const { t } = useTranslation();
  const envelope = isRecord(value) && "data" in value ? value : undefined;
  const data = envelope ? envelope.data : value;
  const keyRows =
    operation === "keys" && Array.isArray(data) && data.every(isRecord)
      ? data
      : undefined;
  const metadata = envelope
    ? Object.fromEntries(
        Object.entries(envelope).filter(
          ([key, v]) =>
            key !== "data" && !(key === "status" && typeof v === "boolean"),
        ),
      )
    : undefined;

  return (
    <section
      className="min-w-0 overflow-hidden rounded-xl border bg-card"
      aria-label={t("qiniu.queryResult")}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-3">
        <div className="flex flex-wrap items-center gap-2.5">
          {operation === "keys" ? (
            <KeyRound
              className="h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
          ) : (
            <Database
              className="h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
          )}
          <h6 className="text-sm font-semibold">
            {t(`qiniu.operations.${operation}`)}
          </h6>
          {Array.isArray(data) && (
            <Badge variant="secondary" className="font-normal tabular-nums">
              {t("qiniu.recordCount", { count: data.length })}
            </Badge>
          )}
          {typeof envelope?.status === "boolean" && (
            <StatusBadge value={envelope.status} result />
          )}
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {t("qiniu.resultTime", { time: checkedAt })}
        </p>
      </div>
      {keyRows?.length ? (
        <KeyTable rows={keyRows} />
      ) : (
        <div className="p-4">
          <QueryValue value={data} />
        </div>
      )}
      {metadata && Object.keys(metadata).length > 0 && (
        <div className="border-t p-4">
          <QueryValue value={metadata} />
        </div>
      )}
    </section>
  );
}

function StatusBadge({
  value,
  result = false,
}: {
  value: boolean;
  result?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Badge
      variant="secondary"
      className={`gap-1.5 whitespace-nowrap font-medium ${value ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}
    >
      {result && value ? (
        <Check className="h-3 w-3" aria-hidden="true" />
      ) : (
        <span
          className="h-1.5 w-1.5 rounded-full bg-current"
          aria-hidden="true"
        />
      )}
      {t(
        result
          ? value
            ? "qiniu.querySuccess"
            : "qiniu.queryFailure"
          : value
            ? "common.enabled"
            : "common.disabled",
      )}
    </Badge>
  );
}

function DateValue({ value }: { value: unknown }) {
  if (typeof value !== "string") return <QueryValue value={value} />;
  const parts =
    /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}:\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/.exec(
      value,
    );
  if (!parts) return <QueryValue value={value} />;
  return (
    <time
      dateTime={value}
      title={value}
      className="block whitespace-nowrap tabular-nums"
    >
      {parts[1]}
      {parts[2] && (
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {parts[2]}
          {parts[3] ? ` ${parts[3] === "Z" ? "UTC" : parts[3]}` : ""}
        </span>
      )}
    </time>
  );
}

const primaryKeyFields = new Set([
  "id",
  "name",
  "key",
  "enabled",
  "enables",
  "totalTokens",
  "createdAt",
  "lastUsed",
]);

function KeyTable({ rows }: { rows: DataRow[] }) {
  const { t } = useTranslation();
  return (
    <div>
      <div
        className="overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label={t("qiniu.operations.keys")}
      >
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
            <tr>
              {[
                "name",
                "key",
                "enabled",
                "totalTokens",
                "createdAt",
                "lastUsed",
              ].map((field) => (
                <th
                  key={field}
                  scope="col"
                  className={`whitespace-nowrap px-4 py-2.5 font-medium ${field === "totalTokens" ? "text-right" : ""}`}
                >
                  {t(`qiniu.fields.${field}`)}
                </th>
              ))}
              <th scope="col" className="px-3 py-2.5">
                <span className="sr-only">{t("qiniu.details")}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.slice(0, 100).map((row, i) => (
              <KeyRow key={i} row={row} />
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 100 && (
        <p className="border-t px-4 py-3 text-xs text-muted-foreground">
          {t("qiniu.truncated", { count: rows.length })}
        </p>
      )}
    </div>
  );
}

function KeyRow({ row }: { row: DataRow }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();
  const extra = Object.fromEntries(
    Object.entries(row).filter(([key]) => !primaryKeyFields.has(key)),
  );
  const hasDetails = Object.values(extra).some((v) => !isEmpty(v));
  return (
    <Fragment>
      <tr className="transition-colors hover:bg-muted/30">
        <td className="px-4 py-3 align-middle">
          <div className="min-w-24 max-w-52 break-words font-medium">
            <QueryValue value={row.name} />
          </div>
          {row.id != null && (
            <div className="mt-1 whitespace-nowrap font-mono text-xs text-muted-foreground">
              ID {String(row.id)}
            </div>
          )}
        </td>
        <td className="px-4 py-3">
          <code className="inline-block whitespace-nowrap rounded-md bg-muted px-2 py-1 text-xs">
            {isEmpty(row.key) ? "—" : String(row.key)}
          </code>
        </td>
        <td className="px-4 py-3">
          <QueryValue value={row.enabled ?? row.enables} />
        </td>
        <td className="px-4 py-3 text-right font-medium tabular-nums">
          <QueryValue value={row.totalTokens} />
        </td>
        <td className="px-4 py-3 text-xs">
          <DateValue value={row.createdAt} />
        </td>
        <td className="px-4 py-3 text-xs">
          <DateValue value={row.lastUsed} />
        </td>
        <td className="px-3 py-3 text-right">
          {hasDetails ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={expanded}
              aria-controls={detailId}
              aria-label={`${t(expanded ? "qiniu.collapseDetails" : "qiniu.details")} · ${String(row.name ?? "")} ${String(row.id ?? "")}`}
              onClick={() => setExpanded(!expanded)}
            >
              {t(expanded ? "qiniu.collapseDetails" : "qiniu.details")}
              <ChevronDown
                aria-hidden="true"
                className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
              />
            </Button>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr id={detailId} className="bg-muted/20">
          <td colSpan={7} className="px-4 py-4">
            <QueryValue value={extra} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function QueryValue({ value, field }: { value: unknown; field?: string }) {
  const { t, i18n } = useTranslation();
  if (Array.isArray(value) && !value.length)
    return (
      <span className="text-sm text-muted-foreground">{t("qiniu.empty")}</span>
    );
  if (isEmpty(value)) return <span className="text-muted-foreground">—</span>;
  if (typeof value === "boolean") return <StatusBadge value={value} />;
  if (typeof value === "number")
    return (
      <span className="tabular-nums">
        {field && /(^id$|_id$|Id$|^code$|^status$)/.test(field)
          ? String(value)
          : value.toLocaleString(i18n.language, { maximumFractionDigits: 20 })}
      </span>
    );
  if (typeof value !== "object")
    return (
      <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
        {String(value)}
      </span>
    );
  if (Array.isArray(value)) {
    if (value.every(isRecord)) {
      const rows = value.slice(0, 100);
      const columns = [...new Set(rows.flatMap(Object.keys))];
      return (
        <div className="max-w-full overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                {columns.map((c) => (
                  <th
                    key={c}
                    scope="col"
                    className="whitespace-nowrap px-3 py-2.5 font-medium"
                  >
                    {t(`qiniu.fields.${c}`, { defaultValue: c })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row, i) => (
                <tr key={i} className="hover:bg-muted/30">
                  {columns.map((c) => (
                    <td key={c} className="min-w-24 px-3 py-3 align-top">
                      {!isEmpty(row[c]) && typeof row[c] === "object" ? (
                        <details className="group">
                          <summary className="cursor-pointer rounded py-1 text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            {t("qiniu.details")}
                          </summary>
                          <div className="mt-2 rounded-lg border p-3">
                            <QueryValue value={row[c]} field={c} />
                          </div>
                        </details>
                      ) : (
                        <QueryValue value={row[c]} field={c} />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {value.length > 100 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {t("qiniu.truncated", { count: value.length })}
            </p>
          )}
        </div>
      );
    }
    return (
      <div className="space-y-2">
        <ul className="flex flex-wrap gap-2">
          {value.slice(0, 100).map((v, i) => (
            <li
              key={i}
              className="rounded-md border bg-background px-2 py-1 text-xs"
            >
              <QueryValue value={v} />
            </li>
          ))}
        </ul>
        {value.length > 100 && (
          <p className="text-xs text-muted-foreground">
            {t("qiniu.truncated", { count: value.length })}
          </p>
        )}
      </div>
    );
  }
  return (
    <dl className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,10rem),1fr))]">
      {Object.entries(value as DataRow).map(([key, v]) => (
        <div
          key={key}
          className={
            Array.isArray(v) && v.some(isRecord)
              ? "col-span-full min-w-0"
              : "min-w-0"
          }
        >
          <dt className="mb-1.5 text-xs text-muted-foreground">
            {t(`qiniu.fields.${key}`, { defaultValue: key })}
          </dt>
          <dd className="text-sm">
            <QueryValue value={v} field={key} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
