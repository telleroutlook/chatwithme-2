import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { UIMessage } from "ai";
import { ChatMessageItem } from "./ChatMessageItem";

const t = (key: string) => {
  const map: Record<string, string> = {
    message_actions_edit_message: "Edit message",
    message_actions_cancel: "Cancel",
    message_actions_save: "Save",
    message_actions_edit: "Edit",
    message_actions_copy_message: "Copy message",
    message_actions_delete_message: "Delete message",
    message_actions_fork_message: "Fork session from message",
    chat_sources_title: "Sources",
    chat_sources_empty: "No snippets available"
  };

  return map[key] ?? key;
};

function createUserMessage(text: string): UIMessage {
  return {
    id: "msg-user",
    role: "user",
    parts: [{ type: "text", text }]
  } as UIMessage;
}

describe("ChatMessageItem", () => {
  it("opens edit dialog and saves message", async () => {
    const onEdit = vi.fn().mockResolvedValue(undefined);

    render(
      <ChatMessageItem
        message={createUserMessage("hello")}
        isStreaming={false}
        isLastMessage={false}
        onDelete={vi.fn()}
        onEdit={onEdit}
        onRegenerate={vi.fn()}
        onFork={vi.fn()}
        getMessageText={(m) =>
          m.parts
            .filter((part) => part.type === "text")
            .map((part) => (part as { text?: string }).text ?? "")
            .join("\n")
        }
        t={t as never}
      />
    );

    fireEvent.click(screen.getByLabelText("Edit message"));

    const dialog = screen.getByRole("dialog");
    const editor = within(dialog).getByRole("textbox");
    fireEvent.change(editor, { target: { value: "hello world" } });

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(onEdit).toHaveBeenCalledWith("msg-user", "hello world");
    });
  });

  it("renders docs variant in full width", () => {
    render(
      <ChatMessageItem
        message={createUserMessage("hello")}
        isStreaming={false}
        isLastMessage={false}
        variant="docs"
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onRegenerate={vi.fn()}
        onFork={vi.fn()}
        getMessageText={(m) =>
          m.parts
            .filter((part) => part.type === "text")
            .map((part) => (part as { text?: string }).text ?? "")
            .join("\n")
        }
        t={t as never}
      />
    );

    expect(screen.getByText("hello")).toBeInTheDocument();
  });
});
