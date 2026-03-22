import { useCallback } from "react";
import type { UIMessage } from "ai";
import { getMessageText } from "../../../utils/message-text";
import { downloadTextFile } from "../../../utils/exporters/image";
import { exportRenderedChatToPdf } from "../../../utils/exporters/renderChatPdf";
import { trackChatEvent } from "../services/trackChatEvent";
import type { UiMessageKey } from "../../../i18n/ui";
import type { TranslateParams } from "../../../hooks/useI18n";

interface UseExportActionsParams {
  currentSessionId: string;
  chatMessages: UIMessage[];
  addToast: (message: string, type: "success" | "error" | "info") => void;
  t: (key: UiMessageKey, params?: TranslateParams) => string;
}

export interface UseExportActionsResult {
  handleExportMarkdown: () => void;
  handleExportPdf: () => Promise<void>;
}

export function useExportActions(params: UseExportActionsParams): UseExportActionsResult {
  const { currentSessionId, chatMessages, addToast, t } = params;

  const handleExportMarkdown = useCallback(() => {
    if (chatMessages.length === 0) return;

    const exportedAt = new Date();
    const timestamp = exportedAt.toISOString().replace(/[:.]/g, "-");
    const filename = `chat-${currentSessionId}-${timestamp}`;
    const lines: string[] = [
      "# Chat Export",
      "",
      `- Session ID: ${currentSessionId}`,
      `- Exported At: ${exportedAt.toISOString()}`,
      "",
      "---",
      ""
    ];

    chatMessages.forEach((message, index) => {
      const role = message.role === "assistant" ? "Assistant" : message.role === "user" ? "User" : "System";
      const content = getMessageText(message).trim();

      lines.push(`## ${index + 1}. ${role}`);
      lines.push("");
      lines.push("````text");
      lines.push(content || "(empty)");
      lines.push("````");
      lines.push("");
    });

    downloadTextFile(lines.join("\n"), `${filename}.md`, "text/markdown");
    addToast(t("topbar_export_markdown_done"), "success");
    trackChatEvent("chat_export_markdown", { messageCount: chatMessages.length, sessionId: currentSessionId });
  }, [addToast, chatMessages, currentSessionId, t]);

  const handleExportPdf = useCallback(async () => {
    if (chatMessages.length === 0) return;

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `chat-${currentSessionId}-${timestamp}.pdf`;

    try {
      await exportRenderedChatToPdf(chatMessages, getMessageText, currentSessionId, filename);
      addToast(t("topbar_export_pdf_done"), "success");
      trackChatEvent("chat_export_pdf", { messageCount: chatMessages.length, sessionId: currentSessionId });
    } catch (error) {
      console.error("Failed to export PDF:", error);
      addToast("Failed to export PDF", "error");
    }
  }, [addToast, chatMessages, currentSessionId, t]);

  return {
    handleExportMarkdown,
    handleExportPdf
  };
}
