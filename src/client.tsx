import { Toaster } from "./components/Toaster";
import { ModalHost } from "./components/modal";
import type { WorkspaceSection } from "./components/layout";
import { ThemeProvider, type ConnectionStatus } from "./components/AgentsUiCompat";
import { ToastProvider, useToast } from "./hooks/useToast";
import { I18nProvider, useI18n } from "./hooks/useI18n";
import { useResponsive } from "./hooks/useResponsive";
import { useUserIdentity } from "./hooks/useUserIdentity";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { UIMessage } from "ai";
import type { MCPServersState } from "agents";
import { nanoid } from "nanoid";
import { trackChatEvent } from "./features/chat/services/trackChatEvent";
import {
  loadCurrentSessionId,
  loadSessions,
  saveCurrentSessionId,
  saveSessions,
  updateSessionMeta,
  type SessionMeta
} from "./features/chat/services/sessionMeta";
import {
  appendLiveProgressEntry,
  parseLiveProgressPart,
  type LiveProgressEntry,
  type ProgressPhase
} from "./features/chat/services/progress";
import { buildSessionViewResetState } from "./features/chat/services/sessionLifecycle";
import { useEventLog } from "./features/chat/hooks/useEventLog";
import {
  createChatTransport,
  type ConnectionPermissions,
  type PreconfiguredServer
} from "./features/chat/services/chatTransport";
import { useSessionSync } from "./features/chat/hooks/useSessionSync";
import { useSessionSyncTriggers } from "./features/chat/hooks/useSessionSyncTriggers";
import { useSessionHistoryHydration } from "./features/chat/hooks/useSessionHistoryHydration";
import { getMessageText } from "./utils/message-text";
import {
  useChatSessionController,
  useMessageActions,
  useToolApprovalController,
  useChatActions,
  useExportActions
} from "./features/chat/controllers";
import { ChatWorkspace } from "./features/chat/app/ChatWorkspace";
import {
  readPreconfiguredServersFromState,
  readPendingApprovalsFromState,
  isReadonlyModeQueryEnabled,
  type RuntimeApprovalItem
} from "./features/chat/services/clientHelpers";
import "./styles.css";

// ============ Main App ============

function App() {
  const { addToast } = useToast();
  const { t, lang, setLang } = useI18n();

  // User identity - persists across sessions
  const { userId, token } = useUserIdentity();

  // Session state
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    const saved = loadCurrentSessionId(userId);
    if (saved) return saved;
    const id = nanoid(8);
    saveCurrentSessionId(userId, id);
    return id;
  });

  const [workspaceSection, setWorkspaceSection] = useState<WorkspaceSection>("chats");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const readonlyMode = useMemo(() => isReadonlyModeQueryEnabled(), []);
  const [permissions, setPermissions] = useState<ConnectionPermissions>({
    canEdit: !readonlyMode,
    readonly: readonlyMode
  });
  const [mcpState, setMcpState] = useState<MCPServersState>({
    prompts: [],
    resources: [],
    servers: {},
    tools: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [preconfiguredServers, setPreconfiguredServers] = useState<
    Record<string, PreconfiguredServer>
  >({});
  const [pendingApprovals, setPendingApprovals] = useState<RuntimeApprovalItem[]>([]);
  const [approvingApprovalId, setApprovingApprovalId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { addEvent: addEventLog } = useEventLog();

  // Responsive hook for mobile detection
  const { mobile } = useResponsive();

  // On mobile, sidebar starts closed
  useEffect(() => {
    if (mobile) {
      setSidebarOpen(false);
    }
  }, [mobile]);

  useEffect(() => {
    if (!mobile) {
      document.body.style.overflow = "";
      return;
    }
    document.body.style.overflow = sidebarOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobile, sidebarOpen]);

  // Chat input
  const [input, setInput] = useState("");
  const [liveProgress, setLiveProgress] = useState<LiveProgressEntry[]>([]);
  const [awaitingFirstAssistant, setAwaitingFirstAssistant] = useState(false);
  const [awaitingAssistantFromIndex, setAwaitingAssistantFromIndex] = useState<number | null>(null);
  const triggerReconnectSyncRef = useRef<() => void>(() => {});
  const identityBypassRef = useRef<string | null>(null);
  const recentCloseAtRef = useRef<number[]>([]);
  const degradeUntilRef = useRef(0);
  const snippetSampleCounterRef = useRef(0);

  // Save current session ID when changed
  useEffect(() => {
    saveCurrentSessionId(userId, currentSessionId);
  }, [userId, currentSessionId]);

  // Build composite agent name for user isolation: "userId:sessionId"
  const agentName = useMemo(() => `${userId}:${currentSessionId}`, [userId, currentSessionId]);

  // Agent connection
  const agent = useAgent({
    agent: "chat-agent-v2",
    name: agentName,
    query: {
      token,
      ...(readonlyMode ? { mode: "view" } : {})
    },
    onIdentity: useCallback(
      (resolvedSessionId: string) => {
        const normalized = resolvedSessionId.trim();
        if (!normalized || normalized === currentSessionId) return;
        if (identityBypassRef.current && identityBypassRef.current === normalized) {
          identityBypassRef.current = null;
          return;
        }
        addEventLog({
          level: "error",
          source: "system",
          type: "session_identity_drift",
          message: "Unexpected identity mismatch detected. Keeping local session binding.",
          data: {
            currentSessionId,
            resolvedSessionId: normalized
          }
        });
      },
      [addEventLog, currentSessionId]
    ),
    onClose: useCallback((event: CloseEvent) => {
      const now = Date.now();
      recentCloseAtRef.current = recentCloseAtRef.current
        .filter((time) => now - time < 60_000)
        .concat(now);
      if (recentCloseAtRef.current.length >= 3) {
        degradeUntilRef.current = now + 60_000;
      }
      setConnectionStatus("disconnected");
      trackChatEvent("connection_close", {
        sessionId: currentSessionId,
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean
      });
      addEventLog({
        level: "error",
        source: "system",
        type: "connection_closed",
        message: "Agent connection closed.",
        data: {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean
        }
      });
    }, [addEventLog, currentSessionId]),
    onIdentityChange: useCallback(
      (oldName: string, newName: string) => {
        addEventLog({
          level: "error",
          source: "system",
          type: "session_identity_change",
          message: `Identity changed on reconnect: ${oldName} -> ${newName}`,
          data: { oldName, newName }
        });
        const stale = loadSessions(userId).map((session) =>
          session.id === oldName
            ? {
                ...session,
                health: "stale" as const,
                mismatchCount: (session.mismatchCount ?? 0) + 1,
                lastSyncedAt: new Date().toISOString()
              }
            : session
        );
        saveSessions(userId, stale);
        setSessions(stale);
      },
      [addEventLog, userId]
    ),
    onMcpUpdate: useCallback((mcpServers: MCPServersState) => {
      setMcpState(mcpServers);
    }, []),
    onStateUpdate: useCallback((nextState: unknown) => {
      const servers = readPreconfiguredServersFromState(nextState);
      if (servers) {
        setPreconfiguredServers(servers);
        setIsLoading(false);
      }
      const approvals = readPendingApprovalsFromState(nextState);
      if (approvals) {
        setPendingApprovals(approvals);
      }
    }, []),
    onOpen: useCallback(() => {
      setConnectionStatus("connected");
      trackChatEvent("connection_open", { sessionId: currentSessionId });
      addEventLog({
        level: "success",
        source: "system",
        type: "connection_open",
        message: "Agent connection established."
      });
      if (Date.now() < degradeUntilRef.current) {
        return;
      }
      triggerReconnectSyncRef.current();
    }, [addEventLog, currentSessionId]),
    onError: useCallback(
      (event: Event) => {
        trackChatEvent("connection_error", { sessionId: currentSessionId });
        addEventLog({
          level: "error",
          source: "system",
          type: "connection_error",
          message: "Agent connection error.",
          data: {
            eventType: event.type
          }
        });
      },
      [addEventLog, currentSessionId]
    )
  });

  // useAgentChat hook for AIChatAgent integration
  const { messages, sendMessage, status, stop, setMessages } = useAgentChat({
    agent,
    resume: true,
    onToolCall: async ({ toolCall }) => {
      console.log("Tool call:", toolCall);
    },
    onData: (part) => {
      const progress = parseLiveProgressPart(part);
      if (!progress) return;
      setLiveProgress((prev) => appendLiveProgressEntry(prev, progress, 6));

      const isModelSnippet = progress.phase === "model" && progress.status === "info" && progress.snippet;
      if (isModelSnippet) {
        snippetSampleCounterRef.current += 1;
        if (snippetSampleCounterRef.current % 2 !== 0) {
          return;
        }
      }

      addEventLog({
        level: progress.status === "error" ? "error" : progress.status === "success" ? "success" : "info",
        source: "agent",
        type: `progress_${progress.phase}`,
        message: progress.message,
        data: progress.snippet ? { snippet: progress.snippet } : undefined,
        timestamp: progress.timestamp
      });
    }
  });

  const isStreaming = status === "streaming";
  const isConnected = connectionStatus === "connected";
  const chatMessages = messages;
  const setChatMessages = useCallback(
    (next: UIMessage[] | ((prev: UIMessage[]) => UIMessage[])) => {
      setMessages((prev) => (typeof next === "function" ? next(prev) : next));
    },
    [setMessages]
  );

  const chatTransport = useMemo(
    () =>
      createChatTransport({
        agent,
        sessionId: currentSessionId,
        readonlyMode
      }),
    [agent, currentSessionId, readonlyMode]
  );

  const { enqueueSessionSync } = useSessionSync({
    userId,
    chatTransport,
    setSessions
  });

  const { triggerReconnectSync } = useSessionSyncTriggers({
    userId,
    currentSessionId,
    enqueueSessionSync,
    setSessions
  });

  useEffect(() => {
    triggerReconnectSyncRef.current = triggerReconnectSync;
  }, [triggerReconnectSync]);

  // Apply session view reset state
  const applySessionViewReset = useCallback(() => {
    const next = buildSessionViewResetState<RuntimeApprovalItem, LiveProgressEntry>(readonlyMode);
    setConnectionStatus(next.connectionStatus);
    setPermissions(next.permissions);
    setIsLoading(next.isLoading);
    setPreconfiguredServers(next.preconfiguredServers);
    setPendingApprovals(next.pendingApprovals);
    setAwaitingFirstAssistant(next.awaitingFirstAssistant);
    setAwaitingAssistantFromIndex(next.awaitingAssistantFromIndex);
    setLiveProgress(next.liveProgress);
  }, [readonlyMode]);

  const loadPermissions = useCallback(async () => {
    try {
      const next = await chatTransport.getPermissions();
      setPermissions({
        canEdit: Boolean(next.canEdit),
        readonly: Boolean(next.readonly)
      });
    } catch (error) {
      console.error("Failed to load connection permissions:", error);
      setPermissions({ canEdit: !readonlyMode, readonly: readonlyMode });
    }
  }, [chatTransport, readonlyMode]);

  const loadHistory = useCallback(async () => {
    return await chatTransport.getHistory();
  }, [chatTransport]);

  useSessionHistoryHydration({
    connectionStatus,
    currentSessionId,
    status,
    loadHistory,
    setChatMessages
  });

  useEffect(() => {
    if (connectionStatus !== "connected") return;
    void loadPermissions();
  }, [connectionStatus, loadPermissions]);

  // Hide live progress panel once assistant content starts arriving
  useEffect(() => {
    if (!awaitingFirstAssistant) return;
    if (awaitingAssistantFromIndex === null) return;
    const hasAssistantContent = chatMessages.some(
      (msg, index) =>
        index >= awaitingAssistantFromIndex &&
        msg.role === "assistant" &&
        getMessageText(msg)
          .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
          .trim().length > 0
    );
    if (hasAssistantContent && status !== "streaming") {
      setAwaitingFirstAssistant(false);
      setAwaitingAssistantFromIndex(null);
      setLiveProgress([]);
    }
  }, [chatMessages, awaitingFirstAssistant, awaitingAssistantFromIndex, status]);

  // Update session meta when messages change
  useEffect(() => {
    if (chatMessages.length > 0) {
      const lastMsg = chatMessages[chatMessages.length - 1];
      const text = getMessageText(lastMsg);

      if (lastMsg.role === "assistant" && text) {
        const firstUserMsg = chatMessages.find((m) => m.role === "user");
        const title = firstUserMsg
          ? getMessageText(firstUserMsg).slice(0, 30) +
            (getMessageText(firstUserMsg).length > 30 ? "..." : "")
          : "New Chat";

        updateSessionMeta(userId, currentSessionId, {
          title,
          lastMessage: text.slice(0, 50) + (text.length > 50 ? "..." : ""),
          timestamp: new Date().toISOString(),
          messageCount: chatMessages.length
        });
        setSessions(loadSessions(userId));
        enqueueSessionSync("assistant_message");
      }
    }
  }, [chatMessages, currentSessionId, enqueueSessionSync, userId]);

  // ============ Controllers ============

  // Session controller
  const sessionController = useChatSessionController({
    userId,
    currentSessionId,
    setCurrentSessionId,
    sessions,
    setSessions,
    permissions,
    chatTransport,
    addToast,
    t,
    stop,
    setChatMessages,
    enqueueSessionSync,
    readonlyMode
  });

  // Apply reset state after session operations
  const wrappedHandleNewSession = useCallback(() => {
    sessionController.handleNewSession();
    applySessionViewReset();
  }, [sessionController, applySessionViewReset]);

  const wrappedHandleSelectSession = useCallback(
    (sessionId: string) => {
      sessionController.handleSelectSession(sessionId);
      applySessionViewReset();
    },
    [sessionController, applySessionViewReset]
  );

  // Message actions controller
  const messageActions = useMessageActions({
    userId,
    currentSessionId,
    permissions,
    chatTransport,
    chatMessages,
    setChatMessages,
    addToast,
    t,
    enqueueSessionSync,
    setAwaitingFirstAssistant,
    setAwaitingAssistantFromIndex,
    setLiveProgress,
    setSessions
  });

  // Tool approval controller
  const toolApprovalController = useToolApprovalController({
    pendingApprovals,
    setPendingApprovals,
    approvingApprovalId,
    setApprovingApprovalId,
    chatTransport,
    addEventLog,
    addToast,
    t
  });

  // Chat actions controller
  const chatActions = useChatActions({
    currentSessionId,
    permissions,
    chatTransport,
    addEventLog,
    addToast,
    t,
    input,
    setInput,
    isStreaming,
    sessions,
    chatMessagesLength: chatMessages.length,
    sendMessage,
    stop,
    handleNewSession: wrappedHandleNewSession,
    handleSelectSession: wrappedHandleSelectSession,
    setAwaitingFirstAssistant,
    setAwaitingAssistantFromIndex,
    setLiveProgress
  });

  // Export actions controller
  const exportActions = useExportActions({
    currentSessionId,
    chatMessages,
    addToast,
    t
  });

  // ============ Computed Values ============

  const approvalContextValue = useMemo(
    () => ({
      pendingApprovalIds: toolApprovalController.pendingApprovalIds,
      approvingApprovalId: toolApprovalController.approvingApprovalId,
      onApproveToolCall: toolApprovalController.handleApproveToolCall,
      onRejectToolCall: toolApprovalController.handleRejectToolCall
    }),
    [toolApprovalController]
  );

  const phaseLabels: Record<ProgressPhase, string> = {
    context: t("live_feed_phase_context"),
    model: t("live_feed_phase_model"),
    thinking: t("live_feed_phase_thinking"),
    tool: t("live_feed_phase_tool"),
    heartbeat: t("live_feed_phase_heartbeat"),
    result: t("live_feed_phase_result"),
    error: t("live_feed_phase_error")
  };

  return (
    <ChatWorkspace
      mobile={mobile}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
      sessions={sessions}
      currentSessionId={currentSessionId}
      workspaceSection={workspaceSection}
      setWorkspaceSection={setWorkspaceSection}
      connectionStatus={connectionStatus}
      permissions={permissions}
      mcpState={mcpState}
      chatMessages={chatMessages}
      isStreaming={isStreaming}
      isConnected={isConnected}
      input={input}
      setInput={setInput}
      awaitingFirstAssistant={awaitingFirstAssistant}
      liveProgress={liveProgress}
      handleNewSession={wrappedHandleNewSession}
      handleSelectSession={wrappedHandleSelectSession}
      handleDeleteSession={sessionController.handleDeleteSession}
      handleSend={chatActions.handleSend}
      handleStop={chatActions.handleStop}
      handleDeleteMessage={messageActions.handleDeleteMessage}
      handleEditMessage={messageActions.handleEditMessage}
      handleRegenerateMessage={messageActions.handleRegenerateMessage}
      handleExportMarkdown={exportActions.handleExportMarkdown}
      handleExportPdf={exportActions.handleExportPdf}
      approvalContextValue={approvalContextValue}
      preconfiguredServers={preconfiguredServers}
      lang={lang}
      setLang={setLang}
      t={t}
      phaseLabels={phaseLabels}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <I18nProvider>
      <ToastProvider>
        <App />
        <Toaster />
        <ModalHost />
      </ToastProvider>
    </I18nProvider>
  </ThemeProvider>
);
