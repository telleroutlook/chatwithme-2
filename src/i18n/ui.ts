export const UI_LANG_STORAGE_KEY = "chatwithme_ui_lang";

export type UiLang = "en" | "zh";

export const uiMessages = {
  en: {
    app_title: "ChatWithMe MCP",
    app_subtitle: "Agent-first chat workspace",
    app_powered_by: "Powered by Agents",

    connection_connecting: "connecting",
    connection_connected: "connected",
    connection_disconnected: "disconnected",

    theme_light: "Light mode",
    theme_dark: "Dark mode",
    theme_system: "System mode",
    theme_group: "Theme mode",

    lang_en: "EN",
    lang_zh: "中",
    lang_group: "Language",

    sidebar_sessions: "Sessions",
    sidebar_close: "Close sidebar",
    sidebar_open: "Open menu",
    sidebar_toggle: "Toggle sidebar",

    session_new: "New Chat",
    session_empty: "No conversations yet",
    session_no_messages: "No messages",
    session_delete: "Delete session",
    session_deleted: "Session deleted",

    tabs_label: "Main sections",
    tabs_chat: "Chat",
    tabs_mcp: "MCP Servers",
    tabs_tools_count: "{count} tools",

    chat_empty_title: "Start a conversation",
    chat_empty_with_tools:
      "AI has access to {count} tools (web search, reading). Just ask anything!",
    chat_empty_no_tools: "Connect MCP servers in the MCP tab to enable tool access.",
    chat_placeholder_tools: "Ask anything... (AI can search web & read pages)",
    chat_placeholder_default: "Type a message...",

    mcp_info_title: "Pre-configured MCP Servers",
    mcp_info_desc:
      "Toggle servers on/off to activate or deactivate them. Active servers provide tools that the AI can use automatically during chat.",
    mcp_loading: "Loading servers...",
    mcp_available_servers: "Available Servers",
    mcp_available_tools: "Available Tools",
    mcp_status_active: "Active",
    mcp_status_inactive: "Inactive",
    mcp_toggle_server: "Toggle server {name}",
    mcp_server: "Server",
    mcp_raw_payload: "Raw payload",

    message_delete_success: "Message deleted",
    message_already_deleted: "Message already deleted",
    message_delete_failed: "Failed to delete message: {reason}",
    server_toggle_success: "Server \"{name}\" {state}",
    server_toggle_active: "activated",
    server_toggle_inactive: "deactivated",
    server_toggle_failed: "Failed to toggle server: {reason}",

    chat_input_placeholder_connecting: "Connecting...",
    chat_input_placeholder_streaming: "Waiting for response...",
    chat_input_action_send: "Send",
    chat_input_action_stop: "Stop",
    chat_input_action_clear: "Clear input",
    chat_input_multiline_indicator: "Multiline input enabled",
    chat_input_hint_shortcuts: "Shift+Enter new line, Enter/Ctrl+Enter/Cmd+Enter send",

    message_actions_copy: "Copy",
    message_actions_copied: "Copied",
    message_actions_copy_message: "Copy message",
    message_actions_copy_status: "Message copied to clipboard",
    message_actions_regenerate: "Regenerate",
    message_actions_regenerate_response: "Regenerate response",
    message_actions_edit: "Edit",
    message_actions_edit_message: "Edit message",
    message_actions_delete: "Delete",
    message_actions_delete_message: "Delete message",

    toaster_region_label: "Notifications",
    toaster_close: "Dismiss notification",
    toaster_hidden_count: "{count} older notifications are hidden",
  },
  zh: {
    app_title: "ChatWithMe MCP",
    app_subtitle: "Agent 优先聊天工作台",
    app_powered_by: "由 Agents 驱动",

    connection_connecting: "连接中",
    connection_connected: "已连接",
    connection_disconnected: "已断开",

    theme_light: "浅色模式",
    theme_dark: "深色模式",
    theme_system: "跟随系统",
    theme_group: "主题模式",

    lang_en: "EN",
    lang_zh: "中",
    lang_group: "语言",

    sidebar_sessions: "会话",
    sidebar_close: "关闭侧栏",
    sidebar_open: "打开菜单",
    sidebar_toggle: "切换侧栏",

    session_new: "新建会话",
    session_empty: "暂无会话",
    session_no_messages: "暂无消息",
    session_delete: "删除会话",
    session_deleted: "会话已删除",

    tabs_label: "主区域",
    tabs_chat: "聊天",
    tabs_mcp: "MCP 服务",
    tabs_tools_count: "{count} 个工具",

    chat_empty_title: "开始一段对话",
    chat_empty_with_tools: "AI 已连接 {count} 个工具（网页搜索、页面读取），可直接提问。",
    chat_empty_no_tools: "请在 MCP 标签页连接服务后再使用工具能力。",
    chat_placeholder_tools: "直接提问...（AI 可搜索网页并读取页面）",
    chat_placeholder_default: "输入消息...",

    mcp_info_title: "预配置 MCP 服务",
    mcp_info_desc:
      "可切换服务启用/停用。启用后，AI 会在聊天中自动使用这些服务提供的工具。",
    mcp_loading: "正在加载服务...",
    mcp_available_servers: "可用服务",
    mcp_available_tools: "可用工具",
    mcp_status_active: "已启用",
    mcp_status_inactive: "未启用",
    mcp_toggle_server: "切换服务 {name}",
    mcp_server: "服务",
    mcp_raw_payload: "原始载荷",

    message_delete_success: "消息已删除",
    message_already_deleted: "消息已是删除状态",
    message_delete_failed: "删除消息失败：{reason}",
    server_toggle_success: "服务“{name}”已{state}",
    server_toggle_active: "启用",
    server_toggle_inactive: "停用",
    server_toggle_failed: "切换服务失败：{reason}",

    chat_input_placeholder_connecting: "连接中...",
    chat_input_placeholder_streaming: "正在等待回复...",
    chat_input_action_send: "发送",
    chat_input_action_stop: "停止",
    chat_input_action_clear: "清空输入",
    chat_input_multiline_indicator: "已启用多行输入",
    chat_input_hint_shortcuts: "Shift+Enter 换行，Enter/Ctrl+Enter/Cmd+Enter 发送",

    message_actions_copy: "复制",
    message_actions_copied: "已复制",
    message_actions_copy_message: "复制消息",
    message_actions_copy_status: "消息已复制到剪贴板",
    message_actions_regenerate: "重新生成",
    message_actions_regenerate_response: "重新生成回复",
    message_actions_edit: "编辑",
    message_actions_edit_message: "编辑消息",
    message_actions_delete: "删除",
    message_actions_delete_message: "删除消息",

    toaster_region_label: "通知",
    toaster_close: "关闭通知",
    toaster_hidden_count: "另有 {count} 条较早通知已隐藏",
  },
} as const;

export type UiMessageKey = keyof typeof uiMessages.en;

export function isUiLang(value: string): value is UiLang {
  return value === "en" || value === "zh";
}

export function getDefaultUiLang(): UiLang {
  if (typeof navigator === "undefined") {
    return "en";
  }
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}
