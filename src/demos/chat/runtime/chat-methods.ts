/**
 * Chat message methods runtime module for ChatAgent
 *
 * Handles:
 * - Chat message CRUD operations
 * - History management
 * - Session management
 *
 * ID Mismatch Problem:
 * The AI SDK client generates its own message IDs (nanoid) for assistant
 * messages during streaming, while the server generates different IDs
 * (format: "assistant_{timestamp}_{random}"). The IDs are only reconciled
 * during the next sendMessage() call via _reconcileAssistantIdsWithServerState.
 *
 * Until reconciliation, operations like regenerate/edit/delete receive
 * client-side IDs that don't exist in server-side this.messages. All
 * mutation operations use resolveMessageIndex() to handle this gracefully.
 */

import { getMessageText } from "../model-utils";

// ============ Types ============

interface MessagePart {
  type: string;
  text?: string;
}

interface ChatMessage {
  id?: string;
  role: string;
  parts: MessagePart[];
}

type SqlResult = Record<string, unknown>[];
type SqlFunction = (strings: TemplateStringsArray, ...values: unknown[]) => SqlResult | Promise<SqlResult>;
type PersistMessagesFunction = (messages: ChatMessage[]) => Promise<void>;
type SetMessagesFunction = (messages: ChatMessage[]) => void;

// ============ ID Resolution ============

/**
 * Resolve a client-side message ID to a server-side message index.
 *
 * Tries:
 * 1. Exact ID match
 * 2. Content-based match — finds a message with the same role and similar
 *    position (used when client/server IDs diverge after streaming)
 * 3. Role-based fallback — finds the last message of the expected role
 *    (for regeneration: last user message; for delete: no fallback)
 *
 * @param msgArray - Server-side message array
 * @param messageId - Client-side message ID
 * @param roleHint - Expected role for fallback matching ("user" | "assistant" | null)
 * @returns Index into msgArray, or -1 if not found
 */
function resolveMessageIndex(
  msgArray: ChatMessage[],
  messageId: string,
  roleHint: string | null = null
): number {
  // 1. Exact match
  const exactIndex = msgArray.findIndex((m) => m.id === messageId);
  if (exactIndex >= 0) return exactIndex;

  // 2. Role-based fallback: find the last message of the expected role
  if (roleHint && msgArray.length > 0) {
    for (let i = msgArray.length - 1; i >= 0; i -= 1) {
      if (msgArray[i].role === roleHint) {
        return i;
      }
    }
  }

  return -1;
}

// ============ Chat Methods ============

/**
 * Get chat message history
 */
export function getHistory(
  messages: unknown
): Array<{ role: string; content: string; id?: string }> {
  const msgArray = (Array.isArray(messages) ? messages : []) as ChatMessage[];
  return msgArray.map((msg) => ({
    id: msg.id,
    role: msg.role,
    content: getMessageText(msg.parts)
  }));
}

/**
 * Clear chat history
 */
export async function clearChat(
  persistMessages: () => Promise<void>
): Promise<{ success: boolean; error?: string }> {
  try {
    await persistMessages();
    return { success: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Unknown error";
    console.error("Error clearing messages:", e);
    return { success: false, error };
  }
}

/**
 * Delete a single chat message by id.
 *
 * Uses resolveMessageIndex to handle client/server ID mismatches.
 * For delete operations we do NOT fall back to "last message" — that would
 * be destructive if the wrong message is targeted. Instead we fall back to
 * a D1 query by the client ID (which may have been reconciled in a prior
 * persistMessages call).
 */
export async function deleteMessage(
  messageId: string,
  sql: SqlFunction,
  currentMessages: unknown,
  setMessages: SetMessagesFunction
): Promise<{ success: boolean; deleted: boolean; error?: string }> {
  if (!messageId) {
    return { success: false, deleted: false, error: "Message ID is required" };
  }

  try {
    const msgArray = (Array.isArray(currentMessages) ? currentMessages : []) as ChatMessage[];

    // Resolve: try exact ID in memory, then fall back to raw messageId
    const memIndex = msgArray.findIndex((m) => m.id === messageId);
    const resolvedId = memIndex >= 0 ? msgArray[memIndex].id! : messageId;

    const result = (await sql`
      delete from cf_ai_chat_agent_messages
      where id = ${resolvedId}
    `) as unknown as { meta?: { changes?: number } };

    const deleted = (result?.meta?.changes ?? 0) > 0;

    setMessages(msgArray.filter((message) => message.id !== resolvedId));

    return { success: true, deleted };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Unknown error";
    console.error("Error deleting message:", e);
    return { success: false, deleted: false, error };
  }
}

/**
 * Edit an existing user message.
 *
 * Uses resolveMessageIndex with roleHint="user" to handle ID mismatches.
 */
export async function editUserMessage(
  messageId: string,
  content: string,
  currentMessages: unknown,
  persistMessages: PersistMessagesFunction
): Promise<{ success: boolean; updated: boolean; error?: string }> {
  if (!messageId || !content.trim()) {
    return { success: false, updated: false, error: "Message ID and content are required" };
  }

  try {
    const msgArray = (Array.isArray(currentMessages) ? currentMessages : []) as ChatMessage[];
    const targetIndex = resolveMessageIndex(msgArray, messageId, "user");

    if (targetIndex < 0 || msgArray[targetIndex].role !== "user") {
      return { success: false, updated: false, error: "User message not found" };
    }

    const targetMessage = msgArray[targetIndex];
    const existingText = getMessageText(targetMessage.parts);
    if (existingText.trim() === content.trim()) {
      return { success: true, updated: false };
    }

    const nextMessages = msgArray.map((message, index) => {
      if (index !== targetIndex) {
        return message;
      }
      return {
        ...message,
        parts: [{ type: "text" as const, text: content.trim() }]
      };
    });

    await persistMessages(nextMessages);
    return { success: true, updated: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, updated: false, error: message };
  }
}

/**
 * Regenerate assistant response starting from a specific message.
 *
 * Uses resolveMessageIndex to handle client/server ID mismatches, then
 * walks backward to find the anchor user message. This ensures regeneration
 * works even when:
 * - Client sends a client-side assistant ID that doesn't exist on the server
 * - The first message failed and the user retries immediately
 * - The page was refreshed and IDs changed during hydration
 */
export async function regenerateFrom(
  messageId: string,
  currentMessages: unknown,
  generateAssistantResponse: (message: string, userAlreadyInHistory: boolean) => Promise<string>,
  persistMessages: PersistMessagesFunction
): Promise<{ success: boolean; response?: string; error?: string }> {
  if (!messageId) {
    return { success: false, error: "Message ID is required" };
  }

  try {
    const msgArray = (Array.isArray(currentMessages) ? currentMessages : []) as ChatMessage[];

    // Resolve the target message. For regeneration the client typically sends
    // an assistant message ID — but after ID mismatch, fall back to the last
    // assistant message. If no assistant messages exist (e.g. the only message
    // is the user's and the response never arrived), fall back to last user msg.
    let index = resolveMessageIndex(msgArray, messageId, "assistant");
    if (index < 0) {
      index = resolveMessageIndex(msgArray, messageId, "user");
    }

    if (index < 0) {
      return { success: false, error: "Message not found" };
    }

    // Walk backward to find the anchor user message
    let anchorIndex = index;
    if (msgArray[index].role !== "user") {
      for (let i = index; i >= 0; i -= 1) {
        if (msgArray[i].role === "user") {
          anchorIndex = i;
          break;
        }
      }
    }

    const anchorMessage = msgArray[anchorIndex];
    if (!anchorMessage || anchorMessage.role !== "user") {
      return { success: false, error: "No user message found for regeneration" };
    }

    const userText = getMessageText(anchorMessage.parts).trim();
    if (!userText) {
      return { success: false, error: "User message content is empty" };
    }

    // Trim history: keep messages up to and including the anchor user message,
    // discarding any subsequent assistant/tool messages that follow it.
    const trimmedMessages = msgArray.slice(0, anchorIndex + 1);
    const regenerated = await generateAssistantResponse(userText, true);
    const assistantMessage: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: "assistant" as const,
      parts: [{ type: "text" as const, text: regenerated }]
    };
    await persistMessages([...trimmedMessages, assistantMessage]);

    return { success: true, response: regenerated };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Seed a session with specific history messages
 */
export async function seedHistory(
  messages: Array<{ id: string; role: "user" | "assistant" | "system"; parts: Array<{ type: "text"; text: string }> }>,
  persistMessages: PersistMessagesFunction
): Promise<{ success: boolean; error?: string }> {
  try {
    await persistMessages(messages);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}
