import type { CommandSuggestionItem } from "../../../types/command";
import type { SessionMeta } from "./sessionMeta";
import type { UiMessageKey } from "../../../i18n/ui";

interface ToolLike {
  name: string;
  serverId?: string;
}

interface BuildSuggestionsParams {
  tools: ToolLike[];
  sessions: SessionMeta[];
  t: (key: UiMessageKey, vars?: Record<string, string>) => string;
}

export function buildCommandSuggestions({ tools, sessions, t }: BuildSuggestionsParams): CommandSuggestionItem[] {
  const toolItems = tools.slice(0, 20).map((tool) => ({
    id: `tool-${tool.serverId}-${tool.name}`,
    trigger: "@" as const,
    label: tool.name,
    description: tool.serverId,
    value: tool.name,
    section: "tools" as const,
    group: "tools",
    priority: 100,
    keywords: [tool.name, tool.serverId ?? ""]
  }));

  const sessionItems = sessions.slice(0, 12).map((session) => ({
    id: `session-${session.id}`,
    trigger: "#" as const,
    label: session.title,
    description: session.lastMessage || t("session_no_messages"),
    value: session.id,
    section: "sessions" as const,
    group: "sessions",
    priority: 80,
    keywords: [session.title, session.lastMessage]
  }));

  const actionItems: CommandSuggestionItem[] = [
    {
      id: "action-new",
      trigger: "!" as const,
      label: t("session_new"),
      description: "Create a new session",
      value: "new",
      section: "actions",
      group: "actions",
      priority: 60,
      keywords: ["new", "session", "create"]
    },
    {
      id: "action-stop",
      trigger: "!" as const,
      label: t("chat_input_action_stop"),
      description: "Stop current generation",
      value: "stop",
      section: "actions",
      group: "actions",
      priority: 50,
      keywords: ["stop", "abort", "cancel"]
    }
  ];

  return [...toolItems, ...sessionItems, ...actionItems];
}
