import { memo, useMemo, useState } from "react";
import { User as UserIcon, Sparkle as SparkleIcon } from "@phosphor-icons/react";
import type { UIMessage } from "ai";
import { Dialog } from "../ui";
import { cn } from "../ui/utils";
import { MessageActions } from "../MessageActions";
import { MessageSources } from "../MessageSources";
import { MarkdownRenderer, type ChartFixContext } from "../MarkdownRenderer";
import { ToolCallCard, extractToolCalls } from "../ToolCallCard";
import { trackChatEvent } from "../../features/chat/services/trackChatEvent";
import { extractMessageSources } from "../../types/message-sources";
import { useApprovalContext } from "../../features/chat/context/ApprovalContext";
import { formatMessageWithRolePrefix } from "../../utils/message-text";

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
  onFixChart?: (messageId: UIMessage["id"], ctx: ChartFixContext) => void;
  getMessageText: (message: UIMessage) => string;
  t: (key: import("../../i18n/ui").UiMessageKey, vars?: Record<string, string>) => string;
}

function ChatMessageItemInner({
  message,
  isStreaming,
  canEdit,
  isLastMessage,
  variant,
  markdownPrefs,
  onDelete,
  onEdit,
  onRegenerate,
  onFixChart,
  getMessageText,
  t
}: ChatMessageItemProps) {
  const isUser = message.role === "user";
  const text = getMessageText(message);
  const prefixedText = formatMessageWithRolePrefix(message.role, text);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [saving, setSaving] = useState(false);
  const approvalContext = useApprovalContext();

  const hasRenderableBlock = !isUser && RENDERABLE_BLOCK_PATTERN.test(text);
  const hasErrorLikeContent = !isUser && /(处理请求时出错|error|failed)/i.test(text);

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
      className={cn(
        "group flex flex-col gap-1 px-4 py-3 w-full",
        isUser ? "items-end" : "items-start"
      )}
    >
      {/* Role label row */}
      <div
        className={cn(
          "flex items-center gap-1.5 mb-1",
          isUser ? "flex-row-reverse" : "flex-row"
        )}
      >
        <span
          className={cn(
            "flex items-center justify-center rounded-full shrink-0",
            isUser
              ? "h-6 w-6 bg-surface-secondary text-foreground-muted"
              : "h-6 w-6 bg-accent/10 text-accent"
          )}
        >
          {isUser ? (
            <UserIcon size={13} weight="bold" />
          ) : (
            <SparkleIcon size={13} weight="fill" />
          )}
        </span>
        <span className="text-xs font-medium text-foreground-muted select-none">
          {isUser ? t("role_user" as import("../../i18n/ui").UiMessageKey) ?? "You" : t("role_assistant" as import("../../i18n/ui").UiMessageKey) ?? "Assistant"}
        </span>
      </div>

      {/* Tool call cards — shown above the text bubble for assistant messages */}
      {!isUser && toolCalls.length > 0 && (
        <div className="w-full space-y-2 mb-2">
          {toolCalls.map((toolCall, index) => (
            <ToolCallCard
              key={`${toolCall.toolName}-${index}`}
              toolName={toolCall.toolName}
              state={toolCall.state}
              input={toolCall.input}
              output={toolCall.output}
              errorText={toolCall.errorText}
              approvalId={toolCall.approvalId}
              canApprove={Boolean(
                toolCall.approvalId && approvalContext?.pendingApprovalIds.has(toolCall.approvalId)
              )}
              approvalBusy={Boolean(
                toolCall.approvalId && approvalContext?.approvingApprovalId === toolCall.approvalId
              )}
              onApprove={approvalContext?.onApproveToolCall}
              onReject={approvalContext?.onRejectToolCall}
            />
          ))}
        </div>
      )}

      {/* Message body */}
      {isUser ? (
        <div className="bg-surface-secondary rounded-2xl px-4 py-3 max-w-[85%] sm:max-w-[75%]">
          <span className="block whitespace-pre-wrap text-sm text-foreground leading-relaxed">
            {prefixedText}
          </span>
        </div>
      ) : (
        <div className={cn("w-full", hasRenderableBlock ? "max-w-full" : "max-w-full")}>
          <MarkdownRenderer
            content={prefixedText}
            isStreaming={isStreaming && isLastMessage}
            enableAlerts={markdownPrefs?.enableAlerts ?? true}
            enableFootnotes={markdownPrefs?.enableFootnotes ?? true}
            streamCursor={markdownPrefs?.streamCursor ?? true}
            citations={citations}
            onFixChart={onFixChart ? (ctx) => onFixChart(message.id, ctx) : undefined}
          />
        </div>
      )}

      {/* Error card */}
      {hasErrorLikeContent && (
        <div className="mt-2 w-full rounded-lg border border-border bg-surface-secondary p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-foreground-muted">{text}</span>
            <button
              className={cn(
                "inline-flex items-center justify-center rounded-lg border border-border",
                "bg-surface-elevated px-3 h-7 text-xs font-medium text-foreground",
                "hover:bg-muted transition-colors",
                "disabled:pointer-events-none disabled:opacity-50"
              )}
              disabled={!canEdit}
              onClick={() => {
                trackChatEvent("message_regenerate", { messageId: message.id, source: "error-card" });
                void onRegenerate(message.id);
              }}
            >
              {t("message_actions_regenerate")}
            </button>
          </div>
        </div>
      )}

      {/* Message sources */}
      {!isUser && (
        <div className="w-full">
          <MessageSources
            groups={sourceGroups}
            title={t("chat_sources_title")}
            emptyLabel={t("chat_sources_empty")}
          />
        </div>
      )}

      {/* Message actions — visible on hover (desktop) or always (mobile) */}
      <div
        className={cn(
          "mt-1 transition-opacity duration-150",
          "opacity-0 group-hover:opacity-100",
          "sm:opacity-0 sm:group-hover:opacity-100",
          // Always visible on mobile (no hover support)
          "max-sm:opacity-100"
        )}
      >
        <MessageActions
          content={text}
          showRegenerate={!isUser}
          showEdit={isUser}
          showDelete={true}
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
          disabled={isStreaming}
          disableMutations={!canEdit}
          compact={!hasRenderableBlock}
        />
      </div>

      {/* Edit dialog */}
      <Dialog
        open={isEditing}
        onClose={() => {
          setIsEditing(false);
          setDraft(text);
        }}
        title={t("message_actions_edit_message")}
        footer={
          <div className="flex justify-end gap-2">
            <button
              className={cn(
                "inline-flex items-center justify-center rounded-lg border border-border",
                "bg-surface-elevated px-3 h-8 text-xs font-medium text-foreground",
                "hover:bg-muted transition-colors",
                "disabled:pointer-events-none disabled:opacity-50"
              )}
              onClick={() => {
                setIsEditing(false);
                setDraft(text);
              }}
            >
              {t("message_actions_cancel")}
            </button>
            <button
              className={cn(
                "inline-flex items-center justify-center rounded-lg",
                "bg-accent px-3 h-8 text-xs font-medium text-accent-foreground",
                "hover:bg-accent/90 transition-colors shadow-sm",
                "disabled:pointer-events-none disabled:opacity-50"
              )}
              onClick={saveEdit}
              disabled={saving}
            >
              {t("message_actions_save")}
            </button>
          </div>
        }
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className={cn(
            "min-h-36 w-full resize-y rounded-lg border border-border",
            "bg-surface-secondary/80 p-3 text-sm text-foreground",
            "focus:outline-none focus:ring-2 focus:ring-accent/40 transition"
          )}
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
  if (prevProps.onFixChart !== nextProps.onFixChart) return false;

  const prevText = prevProps.getMessageText(prevProps.message);
  const nextText = nextProps.getMessageText(nextProps.message);
  return prevText === nextText;
}

export const ChatMessageItem = memo(ChatMessageItemInner, areChatMessageItemPropsEqual);
