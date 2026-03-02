import type { CommandSuggestionItem } from "../../../types/command";
import type { SessionMeta } from "./sessionMeta";
import type { UiMessageKey } from "../../../i18n/ui";

interface ToolLike {
  name: string;
  serverId?: string;
}

interface ModelLike {
  id: string;
  name: string;
  provider?: string;
}

interface FileLike {
  name: string;
  path: string;
  type?: string;
}

interface PromptLike {
  id: string;
  title: string;
  content: string;
  category?: string;
}

interface BuildSuggestionsParams {
  tools: ToolLike[];
  sessions: SessionMeta[];
  models?: ModelLike[];
  files?: FileLike[];
  prompts?: PromptLike[];
  t: (key: UiMessageKey, vars?: Record<string, string>) => string;
}

export function buildCommandSuggestions({
  tools,
  sessions,
  models = [],
  files = [],
  prompts = [],
  t
}: BuildSuggestionsParams): CommandSuggestionItem[] {
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

  // Slash commands for prompts, models, and files
  const promptItems: CommandSuggestionItem[] = prompts.slice(0, 10).map((prompt) => ({
    id: `prompt-${prompt.id}`,
    trigger: "/" as const,
    label: prompt.title,
    description: prompt.category || "Prompt template",
    value: `prompt:${prompt.id}`,
    section: "prompts" as const,
    group: "prompts",
    priority: 90,
    keywords: [prompt.title, prompt.category ?? ""]
  }));

  const modelItems: CommandSuggestionItem[] = models.slice(0, 10).map((model) => ({
    id: `model-${model.id}`,
    trigger: "/" as const,
    label: model.name,
    description: model.provider || "AI Model",
    value: `model:${model.id}`,
    section: "models" as const,
    group: "models",
    priority: 85,
    badge: model.provider,
    keywords: [model.name, model.provider ?? ""]
  }));

  const fileItems: CommandSuggestionItem[] = files.slice(0, 10).map((file) => ({
    id: `file-${file.path}`,
    trigger: "/" as const,
    label: file.name,
    description: file.path,
    value: `file:${file.path}`,
    section: "files" as const,
    group: "files",
    priority: 70,
    badge: file.type,
    keywords: [file.name, file.path]
  }));

  // Built-in slash commands
  const builtInCommands: CommandSuggestionItem[] = [
    {
      id: "cmd-help",
      trigger: "/" as const,
      label: "Help",
      description: "Show available commands",
      value: "help",
      section: "prompts" as const,
      group: "built-in",
      priority: 100,
      keywords: ["help", "commands", "?"]
    },
    {
      id: "cmd-clear",
      trigger: "/" as const,
      label: "Clear",
      description: "Clear the chat history",
      value: "clear",
      section: "prompts" as const,
      group: "built-in",
      priority: 95,
      keywords: ["clear", "reset", "clean"]
    },
    {
      id: "cmd-export",
      trigger: "/" as const,
      label: "Export",
      description: "Export current session",
      value: "export",
      section: "prompts" as const,
      group: "built-in",
      priority: 90,
      keywords: ["export", "download", "save"]
    }
  ];

  return [...toolItems, ...sessionItems, ...actionItems, ...builtInCommands, ...promptItems, ...modelItems, ...fileItems];
}
