export type CommandTrigger = "@" | "#" | "!";

export interface ParsedCommandToken {
  trigger: CommandTrigger;
  query: string;
  start: number;
  end: number;
}

export interface CommandSuggestionItem {
  id: string;
  trigger: CommandTrigger;
  label: string;
  description?: string;
  value: string;
  section: "tools" | "sessions" | "actions";
  keywords?: string[];
  priority?: number;
  group?: string;
}

export interface CommandExecutionIntent {
  rawInput: string;
  normalizedInput: string;
  selectedCommands: Array<{
    trigger: CommandTrigger;
    value: string;
    label: string;
  }>;
}

export function parseCommandToken(input: string, caretIndex: number): ParsedCommandToken | null {
  const safeCaret = Math.min(Math.max(caretIndex, 0), input.length);
  const textBeforeCaret = input.slice(0, safeCaret);
  const match = textBeforeCaret.match(/(?:^|\s)([@#!])([^\s@#!]*)$/);

  if (!match || match.index === undefined) {
    return null;
  }

  const trigger = match[1] as CommandTrigger;
  const query = match[2] ?? "";
  const start = match.index + (match[0].startsWith(" ") ? 1 : 0);

  return {
    trigger,
    query,
    start,
    end: safeCaret
  };
}

export function applyCommandSuggestion(
  input: string,
  token: ParsedCommandToken,
  suggestion: CommandSuggestionItem
): { nextInput: string; nextCaret: number } {
  const insertion = `${suggestion.trigger}${suggestion.value} `;
  const nextInput = `${input.slice(0, token.start)}${insertion}${input.slice(token.end)}`;
  const nextCaret = token.start + insertion.length;

  return { nextInput, nextCaret };
}

export function normalizeCommandInput(
  input: string,
  selected: CommandSuggestionItem[]
): CommandExecutionIntent {
  return {
    rawInput: input,
    normalizedInput: input.trim(),
    selectedCommands: selected.map((item) => ({
      trigger: item.trigger,
      value: item.value,
      label: item.label
    }))
  };
}
