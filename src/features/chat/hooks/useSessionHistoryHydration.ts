import { useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import type { ChatHistoryItem } from "../services/chatTransport";

interface UseSessionHistoryHydrationParams {
  connectionStatus: string;
  currentSessionId: string;
  status: string;
  loadHistory: () => Promise<ChatHistoryItem[]>;
  setChatMessages: (messages: UIMessage[]) => void;
}

function buildHistorySignature(history: ChatHistoryItem[]): string {
  return history.map((item) => `${item.id ?? ""}|${item.role}|${item.content ?? ""}`).join("\u001f");
}

export function useSessionHistoryHydration({
  connectionStatus,
  currentSessionId,
  status,
  loadHistory,
  setChatMessages
}: UseSessionHistoryHydrationParams): void {
  const isHydratingRef = useRef(false);
  const hydrateCooldownRef = useRef<{ sessionId: string; at: number } | null>(null);
  const lastHydratedSignatureRef = useRef<{ sessionId: string; signature: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const hydrateHistory = async () => {
      if (isHydratingRef.current) return;
      if (status !== "ready") return;
      if (connectionStatus === "disconnected") return;

      const now = Date.now();
      const cooldown = hydrateCooldownRef.current;
      if (cooldown && cooldown.sessionId === currentSessionId && now - cooldown.at < 3000) {
        return;
      }

      hydrateCooldownRef.current = { sessionId: currentSessionId, at: now };
      isHydratingRef.current = true;

      try {
        const history = await loadHistory();
        if (cancelled) return;

        const normalizedHistory = Array.isArray(history) ? history : [];
        const signature = buildHistorySignature(normalizedHistory);
        const last = lastHydratedSignatureRef.current;
        if (last && last.sessionId === currentSessionId && last.signature === signature) {
          return;
        }

        const hydrated = normalizedHistory.map((item, index) => ({
          id: item.id ?? `history-${currentSessionId}-${index}`,
          role:
            item.role === "user" || item.role === "assistant" || item.role === "system"
              ? item.role
              : "assistant",
          parts: [{ type: "text", text: item.content ?? "" }]
        }));

        setChatMessages(hydrated as UIMessage[]);
        lastHydratedSignatureRef.current = { sessionId: currentSessionId, signature };
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to hydrate chat history:", error);
      } finally {
        isHydratingRef.current = false;
      }
    };

    void hydrateHistory();

    return () => {
      cancelled = true;
    };
  }, [connectionStatus, currentSessionId, loadHistory, setChatMessages, status]);
}
