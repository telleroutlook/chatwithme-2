/**
 * Chat message methods runtime module for ChatAgent
 *
 * Handles:
 * - Chat message CRUD operations
 * - History management
 * - Session management
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlFunction = (strings: TemplateStringsArray, ...values: any[]) => any;
type PersistMessagesFunction = (messages: ChatMessage[]) => Promise<void>;
type SetMessagesFunction = (messages: ChatMessage[]) => void;

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
): Promise<{ success: boolean }> {
  try {
    await persistMessages();
    return { success: true };
  } catch (e) {
    console.error("Error clearing messages:", e);
    return { success: false };
  }
}

/**
 * Delete a single chat message by id.
 *
 * Note: `sql` is a D1 tagged template that returns a promise (or sync result
 * depending on the runtime). We `await` it to be safe in both cases.
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
    const existing = await sql`
      select count(*) as cnt
      from cf_ai_chat_agent_messages
      where id = ${messageId}
    ` ?? [];

    const deleted = (existing[0]?.cnt ?? 0) > 0;

    await sql`
      delete from cf_ai_chat_agent_messages
      where id = ${messageId}
    `;

    const msgArray = (Array.isArray(currentMessages) ? currentMessages : []) as ChatMessage[];
    setMessages(msgArray.filter((message) => message.id !== messageId));

    return { success: true, deleted };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Unknown error";
    console.error("Error deleting message:", e);
    return { success: false, deleted: false, error };
  }
}

/**
 * Edit an existing user message
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
    const targetIndex = msgArray.findIndex(
      (message) => message.id === messageId && message.role === "user"
    );

    if (targetIndex < 0) {
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
 * Trims history up to (and including) the anchor user message, then
 * generates a fresh assistant response and appends it.
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
    const index = msgArray.findIndex((message) => message.id === messageId);
    if (index < 0) {
      return { success: false, error: "Message not found" };
    }

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
