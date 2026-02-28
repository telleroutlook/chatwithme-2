import { useMemo, useState } from "react";
import {
  applyCommandSuggestion,
  parseCommandToken,
  type CommandSuggestionItem,
  type ParsedCommandToken
} from "../types/command";

interface UseCommandInputOptions {
  input: string;
  caretIndex: number;
  suggestions: CommandSuggestionItem[];
}

export function useCommandInput({ input, caretIndex, suggestions }: UseCommandInputOptions) {
  const [activeIndex, setActiveIndex] = useState(0);

  const token: ParsedCommandToken | null = useMemo(
    () => parseCommandToken(input, caretIndex),
    [input, caretIndex]
  );

  const filteredSuggestions = useMemo(() => {
    if (!token) {
      return [];
    }

    const query = token.query.toLowerCase();
    const scoped = suggestions.filter((item) => item.trigger === token.trigger);

    const next = query
      ? scoped.filter((item) => {
          const label = item.label.toLowerCase();
          const value = item.value.toLowerCase();
          const keywords = (item.keywords ?? []).map((keyword) => keyword.toLowerCase());
          return label.includes(query) || value.includes(query) || keywords.some((k) => k.includes(query));
        })
      : scoped;

    return next.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)).slice(0, 8);
  }, [suggestions, token]);

  const clampedIndex = Math.min(activeIndex, Math.max(filteredSuggestions.length - 1, 0));

  const moveSelection = (delta: number) => {
    if (filteredSuggestions.length === 0) {
      return;
    }
    setActiveIndex((current) => {
      const next = current + delta;
      if (next < 0) {
        return filteredSuggestions.length - 1;
      }
      if (next >= filteredSuggestions.length) {
        return 0;
      }
      return next;
    });
  };

  const getActiveSuggestion = () => filteredSuggestions[clampedIndex] ?? null;

  const applySuggestion = (suggestion: CommandSuggestionItem) => {
    if (!token) {
      return null;
    }
    return applyCommandSuggestion(input, token, suggestion);
  };

  return {
    token,
    filteredSuggestions,
    activeIndex: clampedIndex,
    setActiveIndex,
    moveSelection,
    getActiveSuggestion,
    applySuggestion,
    hasOpenMenu: !!token && filteredSuggestions.length > 0
  };
}
