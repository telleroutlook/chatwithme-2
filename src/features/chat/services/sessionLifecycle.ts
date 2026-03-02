export interface SessionViewResetState<TApproval = unknown, TProgress = unknown> {
  connectionStatus: "connecting";
  permissions: {
    canEdit: boolean;
    readonly: boolean;
  };
  isLoading: true;
  preconfiguredServers: Record<string, never>;
  pendingApprovals: TApproval[];
  awaitingFirstAssistant: false;
  awaitingAssistantFromIndex: null;
  liveProgress: TProgress[];
}

export function buildSessionViewResetState<TApproval = unknown, TProgress = unknown>(
  readonlyMode: boolean
): SessionViewResetState<TApproval, TProgress> {
  return {
    connectionStatus: "connecting",
    permissions: {
      canEdit: !readonlyMode,
      readonly: readonlyMode
    },
    isLoading: true,
    preconfiguredServers: {},
    pendingApprovals: [],
    awaitingFirstAssistant: false,
    awaitingAssistantFromIndex: null,
    liveProgress: []
  };
}
