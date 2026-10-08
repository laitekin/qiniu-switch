import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { FullScreenPanel } from "@/components/common/FullScreenPanel";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import MarkdownEditor from "@/components/MarkdownEditor";
import { useDarkMode } from "@/hooks/useDarkMode";
import {
  workbuddyMemoryApi,
  type WorkBuddyMemoryFile,
  type WorkBuddyMemoryKind,
} from "@/lib/api/workbuddy";

const FILES: [WorkBuddyMemoryKind, string][] = [
  ["MEMORY.md", "memory"],
  ["USER.md", "user"],
  ["SOUL.md", "soul"],
];

export function WorkBuddyMemoryPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const darkMode = useDarkMode();
  const [filename, setFilename] = useState<WorkBuddyMemoryKind>("MEMORY.md");
  const [snapshot, setSnapshot] = useState<WorkBuddyMemoryFile>();
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [pending, setPending] = useState<WorkBuddyMemoryKind | "close" | null>(
    null,
  );
  const dirty = snapshot !== undefined && snapshot.content !== content;
  const errorText = (err: unknown) =>
    t(`workbuddy.memoryEditor.errors.${String(err)}`, {
      defaultValue: t("workbuddy.memoryEditor.failed"),
    });
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setSnapshot(undefined);
    workbuddyMemoryApi
      .read(filename)
      .then((data) => {
        if (!cancelled) {
          setSnapshot(data);
          setContent(data.content);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(errorText(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filename, reload]);
  const navigate = (next: WorkBuddyMemoryKind | "close") => {
    if (next === "close") onClose();
    else {
      setFilename(next);
      setReload((n) => n + 1);
    }
  };
  const requestNavigate = (next: WorkBuddyMemoryKind | "close") => {
    if (saving) return;
    if (dirty) setPending(next);
    else navigate(next);
  };
  const save = async () => {
    if (!snapshot || saving) return;
    setSaving(true);
    setError("");
    try {
      const next = await workbuddyMemoryApi.save(
        filename,
        content,
        snapshot.revision,
      );
      setSnapshot(next);
      toast.success(t("workbuddy.memoryEditor.saved"));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <FullScreenPanel
        isOpen
        title={t("workbuddy.memoryEditor.title")}
        onClose={() => requestNavigate("close")}
        footer={
          <Button
            disabled={
              loading || saving || !snapshot || (!dirty && snapshot.exists)
            }
            onClick={() => void save()}
          >
            {t(saving ? "common.saving" : "common.save")}
          </Button>
        }
      >
        <div className="flex gap-2" role="tablist">
          {FILES.map(([file, key]) => (
            <Button
              role="tab"
              aria-selected={filename === file}
              key={file}
              variant={filename === file ? "default" : "outline"}
              disabled={saving}
              onClick={() => requestNavigate(file)}
            >
              {t(`workbuddy.memoryEditor.${key}`)}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {t("workbuddy.memoryEditor.hint")}
        </p>
        <p className="text-xs text-muted-foreground">~/.workbuddy/{filename}</p>
        {error && (
          <div role="alert" className="text-sm text-destructive">
            {error}{" "}
            <Button
              variant="outline"
              size="sm"
              onClick={() => requestNavigate(filename)}
            >
              {t("common.refresh")}
            </Button>
          </div>
        )}
        {loading ? (
          <p>{t("common.loading")}</p>
        ) : (
          snapshot && (
            <MarkdownEditor
              value={content}
              onChange={setContent}
              darkMode={darkMode}
              readOnly={saving}
              minHeight="360px"
            />
          )
        )}
      </FullScreenPanel>
      <ConfirmDialog
        isOpen={pending !== null}
        title={t("workbuddy.memoryEditor.discardTitle")}
        message={t("workbuddy.memoryEditor.discard")}
        variant="info"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const next = pending;
          setPending(null);
          if (next) navigate(next);
        }}
      />
    </>
  );
}
