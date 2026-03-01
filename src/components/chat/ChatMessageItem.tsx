import { memo, useMemo, useState } from "react";
import { Button, Text } from "@cloudflare/kumo";
import type { UIMessage } from "ai";
import { Dialog } from "../ui";
import { MessageActions } from "../MessageActions";
import { MessageSources } from "../MessageSources";
import { MarkdownRenderer } from "../MarkdownRenderer";
import { ToolCallCard, extractToolCalls } from "../ToolCallCard";
import { trackChatEvent } from "../../features/chat/services/trackChatEvent";
import { extractMessageSources } from "../../types/message-sources";

const RENDERABLE_BLOCK_PATTERN = /```[\s\S]*?```/;

interface ChatMessageItemProps {
  message: UIMessage;
  isStreaming: boolean;
  canEdit: boolean;
  isLastMessage: boolean;
  variant?: "bubble" | "docs";
  markdownPrefs?: {
    enableAlerts: boolean;
    enableFootnotes: boolean;
    streamCursor: boolean;
  };
  onDelete: (messageId: UIMessage["id"]) => void;
  onEdit: (messageId: UIMessage["id"], content: string) => Promise<void>;
  onRegenerate: (messageId: UIMessage["id"]) => Promise<void>;
  onFork: (messageId: UIMessage["id"]) => Promise<void>;
  getMessageText: (message: UIMessage) => string;
  t: (key: import("../../i18n/ui").UiMessageKey, vars?: Record<string, string>) => string;
}

function ChatMessageItemInner({
  message,
  isStreaming,
  canEdit,
  isLastMessage,
  variant = "bubble",
  markdownPrefs,
  onDelete,
  onEdit,
  onRegenerate,
  onFork,
  getMessageText,
  t
}: ChatMessageItemProps) {
  const isUser = message.role === "user";
  const text = getMessageText(message);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [saving, setSaving] = useState(false);

  const hasRenderableBlock = !isUser && RENDERABLE_BLOCK_PATTERN.test(text);
  const actionsLayout: "inline" | "stack" =
    variant === "docs" || hasRenderableBlock ? "stack" : "inline";
  const bubbleWidthClass =
    variant === "docs"
      ? "w-full max-w-full"
      : isUser
        ? "w-fit max-w-[95%] sm:max-w-[85%]"
        : hasRenderableBlock
          ? "w-full max-w-full"
          : "w-fit max-w-[95%] sm:max-w-[85%]";

  const toolCalls = useMemo(
    () =>
      Array.isArray(message.parts)
        ? extractToolCalls(message.parts as Array<{ type: string; [key: string]: unknown }>)
        : [],
    [message.parts]
  );
  const sourceGroups = useMemo(() => extractMessageSources(message.parts), [message.parts]);
  const citations = useMemo(
    () =>
      sourceGroups.map((group) => ({
        id: group.id,
        title: group.title,
        preview: group.chunks[0]?.preview ?? "",
        url: group.url
      })),
    [sourceGroups]
  );
  const hasErrorLikeContent = !isUser && /(处理请求时出错|error|failed)/i.test(text);

  const saveEdit = async () => {
    if (!draft.trim() || draft === text) {
      setIsEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onEdit(message.id, draft.trim());
      trackChatEvent("message_edit_confirm", { messageId: message.id });
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`group flex flex-col ${
        variant === "docs" ? "items-stretch" : isUser ? "items-end" : "items-start"
      }`}
    >
      {!isUser && toolCalls.length > 0 && (
        <div className="mb-2 w-full max-w-[95%] space-y-2 sm:max-w-[85%]">
          {toolCalls.map((toolCall, index) => (
            <ToolCallCard
              key={`${toolCall.toolName}-${index}`}
              toolName={toolCall.toolName}
              state={toolCall.state}
              input={toolCall.input}
              output={toolCall.output}
              errorText={toolCall.errorText}
            />
          ))}
        </div>
      )}

      <div
        className={`${bubbleWidthClass} rounded-2xl px-4 py-2.5 shadow-[var(--app-shadow-soft)] ${
          variant === "docs"
            ? "bg-kumo-surface/95 text-kumo-default ring ring-kumo-line"
            : isUser
              ? "bg-kumo-accent text-[var(--app-text-on-accent)]"
              : "bg-kumo-surface/95 text-kumo-default ring ring-kumo-line"
        }`}
      >
        {isUser ? (
          <span className="block whitespace-pre-wrap">
            <Text size="sm">{text}</Text>
          </span>
        ) : (
          <MarkdownRenderer
            content={text}
            isStreaming={isStreaming && isLastMessage}
            enableAlerts={markdownPrefs?.enableAlerts ?? true}
            enableFootnotes={markdownPrefs?.enableFootnotes ?? true}
            streamCursor={markdownPrefs?.streamCursor ?? true}
            citations={citations}
          />
        )}
      </div>

      {hasErrorLikeContent && (
        <div className="mt-2 rounded-lg border app-border-danger-soft app-bg-danger-soft p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="app-text-danger">
              <Text size="xs">{text}</Text>
            </span>
            <Button
              size="xs"
              variant="secondary"
              disabled={!canEdit}
              onClick={() => {
                trackChatEvent("message_regenerate", { messageId: message.id, source: "error-card" });
                void onRegenerate(message.id);
              }}
            >
              {t("message_actions_regenerate")}
            </Button>
          </div>
        </div>
      )}

      {!isUser && (
        <div className={`${hasRenderableBlock ? "w-full max-w-full" : "w-full max-w-[95%] sm:max-w-[85%]"}`}>
          <MessageSources
            groups={sourceGroups}
            title={t("chat_sources_title")}
            emptyLabel={t("chat_sources_empty")}
          />
        </div>
      )}

      <div className={`mt-1 ${actionsLayout === "stack" ? "w-full" : ""}`}>
        <MessageActions
          content={text}
          showRegenerate={!isUser}
          showEdit={isUser}
          showDelete={true}
          showFork={true}
          onEdit={() => {
            setDraft(text);
            setIsEditing(true);
            trackChatEvent("message_edit_open", { messageId: message.id });
          }}
          onRegenerate={() => {
            trackChatEvent("message_regenerate", { messageId: message.id });
            return onRegenerate(message.id);
          }}
          onDelete={() => onDelete(message.id)}
          onFork={() => onFork(message.id)}
          disabled={isStreaming}
          disableMutations={!canEdit}
          compact={actionsLayout !== "stack"}
        />
      </div>

      <Dialog
        open={isEditing}
        onClose={() => {
          setIsEditing(false);
          setDraft(text);
        }}
        title={t("message_actions_edit_message")}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setIsEditing(false);
                setDraft(text);
              }}
            >
              {t("message_actions_cancel")}
            </Button>
            <Button variant="primary" size="sm" onClick={saveEdit} disabled={saving}>
              {t("message_actions_save")}
            </Button>
          </div>
        }
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="min-h-36 w-full resize-y rounded-lg border border-kumo-line bg-kumo-base/80 p-2 text-sm text-kumo-default"
          aria-label={t("message_actions_edit_message")}
        />
      </Dialog>
    </div>
  );
}

function areChatMessageItemPropsEqual(
  prevProps: ChatMessageItemProps,
  nextProps: ChatMessageItemProps
): boolean {
  if (prevProps.message.id !== nextProps.message.id) return false;
  if (prevProps.message.role !== nextProps.message.role) return false;
  if (prevProps.message.parts !== nextProps.message.parts) return false;
  if (prevProps.isStreaming !== nextProps.isStreaming) return false;
  if (prevProps.isLastMessage !== nextProps.isLastMessage) return false;
  if (prevProps.canEdit !== nextProps.canEdit) return false;
  if (prevProps.variant !== nextProps.variant) return false;
  if (prevProps.markdownPrefs?.enableAlerts !== nextProps.markdownPrefs?.enableAlerts) return false;
  if (prevProps.markdownPrefs?.enableFootnotes !== nextProps.markdownPrefs?.enableFootnotes) return false;
  if (prevProps.markdownPrefs?.streamCursor !== nextProps.markdownPrefs?.streamCursor) return false;

  const prevText = prevProps.getMessageText(prevProps.message);
  const nextText = nextProps.getMessageText(nextProps.message);
  return prevText === nextText;
}

export const ChatMessageItem = memo(ChatMessageItemInner, areChatMessageItemPropsEqual);
