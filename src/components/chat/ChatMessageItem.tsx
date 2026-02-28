import { useMemo, useState } from "react";
import { Button, Text } from "@cloudflare/kumo";
import type { UIMessage } from "ai";
import { MessageActions } from "../MessageActions";
import { MessageSources } from "../MessageSources";
import { MarkdownRenderer } from "../MarkdownRenderer";
import { ToolCallCard, extractToolCalls } from "../ToolCallCard";

const RENDERABLE_BLOCK_PATTERN = /```[\s\S]*?```/;

interface ChatMessageItemProps {
  message: UIMessage;
  isStreaming: boolean;
  isLastMessage: boolean;
  onDelete: (messageId: UIMessage["id"]) => void;
  onEdit: (messageId: UIMessage["id"], content: string) => Promise<void>;
  onRegenerate: (messageId: UIMessage["id"]) => Promise<void>;
  onFork: (messageId: UIMessage["id"]) => Promise<void>;
  getMessageText: (message: UIMessage) => string;
  t: (key: import("../../i18n/ui").UiMessageKey, vars?: Record<string, string>) => string;
}

export function ChatMessageItem({
  message,
  isStreaming,
  isLastMessage,
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
  const bubbleWidthClass = isUser
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

  const saveEdit = async () => {
    if (!draft.trim() || draft === text) {
      setIsEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onEdit(message.id, draft.trim());
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`group flex flex-col ${isUser ? "items-end" : "items-start"}`}>
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
          isUser
            ? "bg-kumo-accent text-[var(--app-text-on-accent)]"
            : "bg-kumo-surface/95 text-kumo-default ring ring-kumo-line"
        }`}
      >
        {isEditing ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-h-24 w-full resize-y rounded-lg border border-kumo-line bg-kumo-base/80 p-2 text-sm text-kumo-default"
              aria-label={t("message_actions_edit_message")}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setIsEditing(false)}>
                {t("message_actions_cancel")}
              </Button>
              <Button variant="primary" size="sm" onClick={saveEdit} disabled={saving}>
                {t("message_actions_save")}
              </Button>
            </div>
          </div>
        ) : isUser ? (
          <span className="block whitespace-pre-wrap">
            <Text size="sm">{text}</Text>
          </span>
        ) : (
          <MarkdownRenderer content={text} isStreaming={isStreaming && isLastMessage} />
        )}
      </div>

      {!isUser && (
        <div className={`${hasRenderableBlock ? "w-full max-w-full" : "w-full max-w-[95%] sm:max-w-[85%]"}`}>
          <MessageSources
            parts={message.parts}
            title={t("chat_sources_title")}
            emptyLabel={t("chat_sources_empty")}
          />
        </div>
      )}

      {!isEditing && (
        <div className="mt-1">
          <MessageActions
            content={text}
            showRegenerate={!isUser}
            showEdit={isUser}
            showDelete={true}
            showFork={true}
            onEdit={() => {
              setDraft(text);
              setIsEditing(true);
            }}
            onRegenerate={() => onRegenerate(message.id)}
            onDelete={() => onDelete(message.id)}
            onFork={() => onFork(message.id)}
            disabled={isStreaming}
            compact={true}
          />
        </div>
      )}
    </div>
  );
}
