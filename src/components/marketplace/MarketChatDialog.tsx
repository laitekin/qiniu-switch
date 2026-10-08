import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  sendMarketChat,
  type MarketChatMessage,
} from "@/lib/api/qiniuMarketChat";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiKey: string;
  modelId: string;
  modelName?: string;
}

export function MarketChatDialog({
  open,
  onOpenChange,
  apiKey,
  modelId,
  modelName,
}: Props) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<MarketChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const inFlight = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sequence.current += 1;
    inFlight.current = false;
    setMessages([]);
    setDraft("");
    setError("");
    setBusy(false);
    return () => {
      sequence.current += 1;
    };
  }, [open, modelId, apiKey]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages, busy]);

  const send = async () => {
    const content = draft.trim();
    if (
      inFlight.current ||
      !content ||
      !apiKey.trim() ||
      !modelId ||
      messages.length >= 20
    )
      return;
    const current = ++sequence.current;
    const pending: MarketChatMessage[] = [
      ...messages,
      { role: "user", content },
    ];
    inFlight.current = true;
    setMessages(pending);
    setDraft("");
    setBusy(true);
    setError("");
    try {
      const result = await sendMarketChat(apiKey.trim(), modelId, pending);
      if (current !== sequence.current) return;
      setMessages([...pending, { role: "assistant", content: result.content }]);
    } catch (cause) {
      if (current !== sequence.current) return;
      setMessages(messages);
      setDraft(content);
      const code = String(cause);
      setError(
        code === "QINIU_CHAT_AUTH"
          ? t("marketplace.chatAuthError", {
              defaultValue: "API Key 无效或无权使用此模型",
            })
          : code === "QINIU_CHAT_RATE_LIMIT"
            ? t("marketplace.chatRateLimit", {
                defaultValue: "请求受限，请稍后重试",
              })
            : code === "QINIU_CHAT_LIMIT"
              ? t("marketplace.chatContextLimit", {
                  defaultValue: "内容过长，请清空对话后重试",
                })
              : t("marketplace.chatError", {
                  defaultValue: "请求失败，请稍后重试或更换模型",
                }),
      );
    } finally {
      if (current === sequence.current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(42rem,90vh)] max-w-3xl" zIndex="top">
        <DialogHeader className="flex-row items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <DialogTitle className="truncate">
              {modelName || modelId}
            </DialogTitle>
            <DialogDescription>
              {t("marketplace.chatHint", {
                defaultValue: "文字体验 · 按实际用量计费 · 关闭后清空",
              })}
            </DialogDescription>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              size="icon"
              variant="ghost"
              disabled={busy || !messages.length}
              aria-label={t("marketplace.clearChat", {
                defaultValue: "清空对话",
              })}
              onClick={() => {
                setMessages([]);
                setError("");
              }}
            >
              <Trash2 size={16} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t("marketplace.closeChat", {
                defaultValue: "关闭对话",
              })}
              onClick={() => onOpenChange(false)}
            >
              <X size={18} />
            </Button>
          </div>
        </DialogHeader>
        <div
          className="min-h-0 flex-1 overflow-y-auto px-6 py-5"
          role="log"
          aria-live="polite"
        >
          {!messages.length && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {t("marketplace.chatEmpty", {
                defaultValue: "输入问题，开始体验",
              })}
            </p>
          )}
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[90%] whitespace-pre-wrap break-words rounded-xl px-4 py-3 text-sm [overflow-wrap:anywhere] ${message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                >
                  {message.content}
                </div>
              </div>
            ))}
            {busy && (
              <div
                role="status"
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Loader2 size={16} className="animate-spin" />
                {t("marketplace.chatThinking", { defaultValue: "正在回复…" })}
              </div>
            )}
          </div>
          <div ref={endRef} />
        </div>
        <form
          className="space-y-2 border-t border-border-default px-6 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {messages.length >= 20 && (
            <p className="text-xs text-muted-foreground">
              {t("marketplace.chatRoundLimit", {
                defaultValue: "已达体验轮数上限，请清空后继续",
              })}
            </p>
          )}
          {(!apiKey.trim() || !modelId) && (
            <p className="text-xs text-muted-foreground">
              {t("marketplace.chatNeedConnection", {
                defaultValue: "请先连接 API Key 并选择可用模型",
              })}
            </p>
          )}
          <div className="flex items-end gap-3">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={8000}
              disabled={
                busy || !apiKey.trim() || !modelId || messages.length >= 20
              }
              aria-label={t("marketplace.chatMessage", {
                defaultValue: "输入问题",
              })}
              placeholder={t("marketplace.chatMessage", {
                defaultValue: "输入问题",
              })}
              className="max-h-32 min-h-20 resize-none"
            />
            <Button
              type="submit"
              disabled={
                busy ||
                !draft.trim() ||
                !apiKey.trim() ||
                !modelId ||
                messages.length >= 20
              }
            >
              <Send size={15} className="mr-2" />
              {t("marketplace.send", { defaultValue: "发送" })}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
