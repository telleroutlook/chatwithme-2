import { useMemo, useRef } from "react";
import type { UIMessage } from "ai";
import type { MCPServersState } from "agents";
import {
  ChatPane,
  TopBar,
  WorkspaceSidebar,
  type WorkspaceSection
} from "../../../components/layout";
import type { ConnectionStatus } from "../../../components/AgentsUiCompat";
import { ApprovalContext } from "../context/ApprovalContext";
import { ChatSessionProvider } from "../context/ChatSessionContext";
import { extractMessageSources } from "../../../types/message-sources";
import { getMessageText } from "../../../utils/message-text";
import { buildCommandSuggestions } from "../services/commandSuggestions";
import { buildObservabilitySnapshot } from "../services/observability";
import type { SessionMeta } from "../services/sessionMeta";
import type { LiveProgressEntry, ProgressPhase } from "../services/progress";
import type { CommandSuggestionItem } from "../../../types/command";
import type { PreconfiguredServer } from "../services/chatTransport";
import { useChatTelemetry } from "../hooks/useChatTelemetry";
import type { UiLang, UiMessageKey } from "../../../i18n/ui";
import type { TranslateParams } from "../../../hooks/useI18n";
import type { EventLogEntry } from "../hooks/useEventLog";
import type { SessionSyncReason } from "../services/sessionSync";

interface ChatWorkspaceProps {
  // Mobile state
  mobile: boolean;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  // Session state
  sessions: SessionMeta[];
  currentSessionId: string;
  workspaceSection: WorkspaceSection;
  setWorkspaceSection: (section: WorkspaceSection) => void;

  // Connection state
  connectionStatus: ConnectionStatus;
  permissions: { canEdit: boolean; readonly: boolean };
  mcpState: MCPServersState;

  // Chat state
  chatMessages: UIMessage[];
  isStreaming: boolean;
  isConnected: boolean;
  input: string;
  setInput: (input: string) => void;
  awaitingFirstAssistant: boolean;
  liveProgress: LiveProgressEntry[];

  // Handlers
  handleNewSession: () => void;
  handleSelectSession: (sessionId: string) => void;
  handleDeleteSession: (sessionId: string) => Promise<void>;
  handleSend: () => void;
  handleStop: () => void;
  handleDeleteMessage: (messageId: UIMessage["id"]) => Promise<void>;
  handleEditMessage: (messageId: UIMessage["id"], content: string) => Promise<void>;
  handleRegenerateMessage: (messageId: UIMessage["id"]) => Promise<void>;
  handleExportMarkdown: () => void;
  handleExportPdf: () => Promise<void>;

  // Approval context
  approvalContextValue: {
    pendingApprovalIds: Set<string>;
    approvingApprovalId: string | null;
    onApproveToolCall: (approvalId: string) => void;
    onRejectToolCall: (approvalId: string) => void;
  };

  // MCP servers
  preconfiguredServers: Record<string, PreconfiguredServer>;

  // i18n
  lang: UiLang;
  setLang: (lang: UiLang) => void;
  t: (key: UiMessageKey, params?: TranslateParams) => string;

  // Phase labels
  phaseLabels: Record<ProgressPhase, string>;
}

export function ChatWorkspace({
  mobile,
  sidebarOpen,
  setSidebarOpen,
  sessions,
  currentSessionId,
  workspaceSection,
  setWorkspaceSection,
  connectionStatus,
  permissions,
  mcpState,
  chatMessages,
  isStreaming,
  isConnected,
  input,
  setInput,
  awaitingFirstAssistant,
  liveProgress,
  handleNewSession,
  handleSelectSession,
  handleDeleteSession,
  handleSend,
  handleStop,
  handleDeleteMessage,
  handleEditMessage,
  handleRegenerateMessage,
  handleExportMarkdown,
  handleExportPdf,
  approvalContextValue,
  preconfiguredServers,
  lang,
  setLang,
  t,
  phaseLabels
}: ChatWorkspaceProps) {
  const telemetry = useChatTelemetry();
  const telemetrySummary = useMemo(() => buildObservabilitySnapshot(telemetry), [telemetry]);

  const commandSuggestions = useMemo<CommandSuggestionItem[]>(
    () =>
      buildCommandSuggestions({
        tools: mcpState.tools,
        sessions,
        t
      }),
    [mcpState.tools, sessions, t]
  );

  const sourceGroupsCount = useMemo(
    () =>
      chatMessages.reduce((sum, message) => {
        return sum + extractMessageSources(message.parts).length;
      }, 0),
    [chatMessages]
  );

  const activeToolsCount = mcpState.tools.length;
  const exportCaptureRef = useRef<HTMLElement | null>(null);

  // Format relative time
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "now";
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return date.toLocaleDateString();
  };

  return (
    <div className="flex h-full bg-surface text-foreground">
      <WorkspaceSidebar
        mobile={mobile}
        sidebarOpen={sidebarOpen}
        sessions={sessions}
        currentSessionId={currentSessionId}
        section={workspaceSection}
        onSectionChange={setWorkspaceSection}
        onClose={() => setSidebarOpen(false)}
        onNewSession={() => {
          handleNewSession();
          if (mobile) {
            setSidebarOpen(false);
          }
        }}
        onSelectSession={(sessionId: string) => {
          handleSelectSession(sessionId);
          if (mobile) {
            setSidebarOpen(false);
          }
        }}
        onDeleteSession={handleDeleteSession}
        formatTime={formatTime}
        toolsCount={mcpState.tools.length}
        resourcesCount={mcpState.resources.length}
        observability={{
          toolsCount: mcpState.tools.length,
          sourcesCount: sourceGroupsCount,
          liveProgress,
          telemetry,
          telemetrySummary
        }}
        lang={lang}
        setLang={setLang}
        t={t}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TopBar
          mobile={mobile}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          onNewSession={handleNewSession}
          onExportMarkdown={handleExportMarkdown}
          onExportPdf={handleExportPdf}
          disableExportAll={chatMessages.length === 0}
          connectionStatus={connectionStatus}
          t={t}
        />

        <div className="flex min-h-0 flex-1">
          <main className="min-h-0 min-w-0 flex-1">
            <ChatSessionProvider currentSessionId={currentSessionId}>
              <ApprovalContext.Provider value={approvalContextValue}>
                <ChatPane
                  messages={chatMessages}
                  isStreaming={isStreaming}
                  isConnected={isConnected}
                  canEdit={permissions.canEdit}
                  isReadonly={permissions.readonly}
                  activeToolsCount={activeToolsCount}
                  awaitingFirstAssistant={awaitingFirstAssistant}
                  liveProgress={liveProgress}
                  phaseLabels={phaseLabels}
                  input={input}
                  setInput={setInput}
                  commandSuggestions={commandSuggestions}
                  onSend={handleSend}
                  onStop={handleStop}
                  onDeleteMessage={handleDeleteMessage}
                  onEditMessage={handleEditMessage}
                  onRegenerateMessage={handleRegenerateMessage}
                  t={t}
                  getMessageText={getMessageText}
                  exportCaptureRef={exportCaptureRef}
                />
              </ApprovalContext.Provider>
            </ChatSessionProvider>
          </main>
        </div>
      </div>
    </div>
  );
}
