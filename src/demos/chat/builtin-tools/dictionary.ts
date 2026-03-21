/**
 * Built-in English dictionary tool — uses the Free Dictionary API (no key required).
 *
 * API: https://api.dictionaryapi.dev/api/v2/entries/en/{word}
 * Completely free, no authentication, Cloudflare Workers compatible.
 * Returns: definitions, phonetics, examples, part of speech, synonyms.
 */

import { z } from "zod";
import type { ToolSet } from "ai";
import { tool } from "ai";

export const BUILTIN_DICTIONARY_KEY = "builtin_dictionary";

// ============ Free Dictionary API ============

interface Phonetic {
  text?: string;
  audio?: string;
}

interface Definition {
  definition: string;
  example?: string;
  synonyms?: string[];
  antonyms?: string[];
}

interface Meaning {
  partOfSpeech: string;
  definitions: Definition[];
  synonyms?: string[];
  antonyms?: string[];
}

interface DictionaryEntry {
  word: string;
  phonetic?: string;
  phonetics?: Phonetic[];
  origin?: string;
  meanings: Meaning[];
}

async function fetchDefinition(word: string): Promise<DictionaryEntry[]> {
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.trim().toLowerCase())}`;
  const resp = await fetch(url, {
    headers: { "User-Agent": "ChatWithMe/2.0 (dictionary tool)" },
  });
  if (resp.status === 404) {
    throw new Error(`No dictionary entry found for "${word}".`);
  }
  if (!resp.ok) {
    throw new Error(`Dictionary API failed: HTTP ${resp.status}`);
  }
  return (await resp.json()) as DictionaryEntry[];
}

function formatEntry(entries: DictionaryEntry[]): string {
  const entry = entries[0];
  const lines: string[] = [];

  // Word + phonetic
  const phonetic =
    entry.phonetic ??
    entry.phonetics?.find((p) => p.text)?.text;
  lines.push(`**${entry.word}**${phonetic ? `  \`${phonetic}\`` : ""}`);

  if (entry.origin) {
    lines.push(`*Origin: ${entry.origin}*`);
  }
  lines.push("");

  // Each part of speech (cap at 3 meanings, 2 definitions each)
  const meaningsToShow = entry.meanings.slice(0, 3);
  for (const meaning of meaningsToShow) {
    lines.push(`**${meaning.partOfSpeech}**`);
    const defs = meaning.definitions.slice(0, 2);
    for (let i = 0; i < defs.length; i++) {
      const d = defs[i];
      lines.push(`${i + 1}. ${d.definition}`);
      if (d.example) {
        lines.push(`   *"${d.example}"*`);
      }
    }

    // Synonyms (from meaning-level or first definition)
    const synonyms =
      meaning.synonyms?.length
        ? meaning.synonyms
        : meaning.definitions[0]?.synonyms ?? [];
    if (synonyms.length > 0) {
      lines.push(`   Synonyms: ${synonyms.slice(0, 5).join(", ")}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

// ============ AI Tool Definition ============

export function createDictionaryTool(): ToolSet {
  return {
    [BUILTIN_DICTIONARY_KEY]: tool({
      description:
        "Look up an English word's definition, pronunciation, part of speech, usage examples, and synonyms. Use for vocabulary questions, writing assistance, or explaining English words. Only supports English words.",
      inputSchema: z.object({
        word: z
          .string()
          .describe(
            "The English word to look up. Should be a single word in its base form (e.g. 'run', 'beautiful', 'ubiquitous')."
          ),
      }),
      execute: async ({ word }: { word: string }) => {
        if (!word?.trim()) return "Error: No word provided.";
        try {
          const entries = await fetchDefinition(word.trim());
          return formatEntry(entries);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Dictionary error: ${msg}`;
        }
      },
    }),
  };
}
