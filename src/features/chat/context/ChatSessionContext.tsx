import { createContext, useContext, type ReactNode } from "react";

interface ChatSessionContextValue {
  currentSessionId: string;
}

const ChatSessionContext = createContext<ChatSessionContextValue | null>(null);

export function ChatSessionProvider({
  currentSessionId,
  children
}: ChatSessionContextValue & { children: ReactNode }) {
  return (
    <ChatSessionContext.Provider value={{ currentSessionId }}>
      {children}
    </ChatSessionContext.Provider>
  );
}

export function useChatSessionContext() {
  const context = useContext(ChatSessionContext);
  if (!context) {
    // Return a default empty string if not in context, to avoid crashing
    // but allow tracking with empty ID if necessary.
    return { currentSessionId: "" };
  }
  return context;
}
