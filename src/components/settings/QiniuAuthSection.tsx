import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { QiniuQueryResult } from "./QiniuQueryResult";
import { ProviderIcon } from "@/components/ProviderIcon";
import { defaultQiniuParams, qiniuApi, qiniuEndpoints } from "@/lib/api/qiniu";

// Keep returned management data in component memory, not localStorage or the
// provider database. API keys in responses have already been masked by Rust.
export function QiniuAuthSection() {
  const { t } = useTranslation();
  const status = useQuery({
    queryKey: ["qiniu", "environment"],
    queryFn: qiniuApi.status,
    retry: false,
  });
  const [operation, setOperation] = useState("keys");
  const endpoint = qiniuEndpoints.find((e) => e.id === operation)!;
  const [params, setParams] = useState<Record<string, string>>({});
  const [result, setResult] = useState<unknown>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [checkedAt, setCheckedAt] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const errorText = (error: unknown) => {
    const code = String(error);
    const http = /^qiniu_http_(\d{3})$/.exec(code);
    if (http) return t("qiniu.httpError", { status: http[1] });
    return t(`qiniu.errors.${code}`, { defaultValue: t("qiniu.failed") });
  };
  const run = async (connect = false) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setResult(undefined);
    setCheckedAt("");
    if (connect) {
      setOperation("keys");
      setParams({});
      setVerified(false);
    }
    try {
      if (connect && (accessKey || secretKey)) {
        if (!accessKey.trim() || !secretKey.trim())
          throw "qiniu_missing_credentials";
        const ak = accessKey.trim();
        const sk = secretKey.trim();
        setAccessKey("");
        setSecretKey("");
        const data = await qiniuApi.connect(ak, sk);
        setResult(data);
        setCheckedAt(new Date().toLocaleString());
        setVerified(true);
        return;
      }
      const current = await status.refetch();
      if (current.error) throw "qiniu_desktop_unavailable";
      if (!current.data?.configured) throw "qiniu_missing_credentials";
      const data = await qiniuApi.query(
        connect ? "keys" : operation,
        connect
          ? {}
          : Object.fromEntries(
              Object.entries(params)
                .filter(([, v]) => v.trim())
                .map(([k, v]) => [k, v.trim()]),
            ),
      );
      setResult(data);
      setCheckedAt(new Date().toLocaleString());
      if (connect || operation === "keys") setVerified(true);
    } catch (err) {
      setVerified(false);
      setError(
        String(err) === "qiniu_desktop_unavailable"
          ? t("qiniu.desktopRequired")
          : errorText(err),
      );
    } finally {
      await status.refetch();
      setBusy(false);
    }
  };
  return (
    <section
      className="scroll-mt-4 rounded-xl border border-border/60 bg-card/60 p-6 space-y-5"
      aria-label={t("qiniu.title")}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
            <ProviderIcon icon="qiniu" name="Qiniu" size={28} />
          </div>
          <div>
            <h4 className="font-medium">{t("qiniu.title")}</h4>
            <p className="text-sm text-muted-foreground">
              {t("qiniu.subtitle")}
            </p>
          </div>
        </div>
        <Badge variant="secondary">
          {!accessKey && !secretKey && (verified || status.data?.verified)
            ? t("qiniu.verified")
            : status.data?.configured
              ? t("qiniu.unverified")
              : t("qiniu.unconfigured")}
        </Badge>
      </div>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void run(true);
        }}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            AK
            <Input
              value={accessKey}
              onChange={(event) => setAccessKey(event.target.value)}
              placeholder="AccessKey"
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
            />
          </label>
          <label className="space-y-1 text-sm">
            SK
            <Input
              type="password"
              value={secretKey}
              onChange={(event) => setSecretKey(event.target.value)}
              placeholder="SecretKey"
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
            />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("qiniu.sessionHint")}
        </p>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy || status.isFetching}>
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {t("qiniu.connect")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setResult(undefined);
              setParams({});
              setAccessKey("");
              setSecretKey("");
              setVerified(false);
              setCheckedAt("");
              setError("");
              try {
                await qiniuApi.disconnect();
                await status.refetch();
              } catch (err) {
                setError(errorText(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("qiniu.disconnect")}
          </Button>
        </div>
      </form>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">
          {t("qiniu.credentialHelp")}
        </summary>
        <dl className="grid gap-3 text-sm md:grid-cols-3 mt-3">
          {(["management", "model", "cookie"] as const).map((kind) => (
            <div key={kind} className="rounded-lg border p-3">
              <dt className="font-medium">
                {t(`qiniu.credentials.${kind}.title`)}
              </dt>
              <dd className="mt-1 text-muted-foreground">
                {t(`qiniu.credentials.${kind}.body`)}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-muted-foreground">
          {t("qiniu.envHint")} <code>QINIU_ACCESS_KEY</code> /{" "}
          <code>QINIU_SECRET_KEY</code>
        </p>
        <p className="text-sm text-muted-foreground">{t("qiniu.maskedHint")}</p>
      </details>
      {status.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t("qiniu.desktopRequired")}
        </p>
      )}
      <div className="border-t pt-4 space-y-3">
        <h5 className="text-sm font-medium">{t("qiniu.queries")}</h5>
        <div className="flex flex-wrap gap-2">
          {qiniuEndpoints
            .filter((e) => e.available)
            .map((e) => (
              <Button
                size="sm"
                key={e.id}
                disabled={busy}
                variant={operation === e.id ? "default" : "outline"}
                onClick={() => {
                  setOperation(e.id);
                  setParams(defaultQiniuParams(e));
                  setResult(undefined);
                  setError("");
                  setCheckedAt("");
                }}
              >
                {t(`qiniu.operations.${e.id}`)}
              </Button>
            ))}
        </div>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void run();
          }}
        >
          <div className="grid gap-3 md:grid-cols-2">
            {endpoint.parameters.map((p) => (
              <label key={p.name} className="space-y-1 text-sm">
                <span>
                  {t(`qiniu.parameters.${p.name}`, { defaultValue: p.name })}
                  {p.required ? " *" : ""}
                </span>
                {p.options ? (
                  <select
                    className="h-9 w-full rounded-md border bg-background px-3"
                    value={params[p.name] ?? ""}
                    required={p.required}
                    disabled={busy}
                    onChange={(e) =>
                      setParams({ ...params, [p.name]: e.target.value })
                    }
                  >
                    <option value="">{t("qiniu.default")}</option>
                    {p.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    type={
                      p.name === "month"
                        ? "month"
                        : p.type === "integer"
                          ? "number"
                          : /api_?key/.test(p.name)
                            ? "password"
                            : "text"
                    }
                    autoComplete="off"
                    min={p.min}
                    max={p.max}
                    required={p.required}
                    disabled={busy}
                    placeholder={
                      p.format === "date-time"
                        ? "2026-09-01T00:00:00+08:00"
                        : undefined
                    }
                    value={params[p.name] ?? ""}
                    onChange={(e) =>
                      setParams({ ...params, [p.name]: e.target.value })
                    }
                  />
                )}
              </label>
            ))}
          </div>
          <Button
            type="submit"
            disabled={busy || Boolean(accessKey || secretKey)}
          >
            {t("qiniu.query")}
          </Button>
        </form>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {result !== undefined && (
          <QiniuQueryResult
            value={result}
            operation={operation}
            checkedAt={checkedAt}
          />
        )}
      </div>
    </section>
  );
}
