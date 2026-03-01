export interface MessageSourceChunk {
  id: string;
  preview: string;
  score?: number;
}

export interface MessageSourceGroup {
  id: string;
  title: string;
  url?: string;
  chunks: MessageSourceChunk[];
}

interface CandidateChunk {
  id?: unknown;
  text?: unknown;
  preview?: unknown;
  score?: unknown;
}

interface CandidateSource {
  fileName?: unknown;
  title?: unknown;
  source?: unknown;
  url?: unknown;
  href?: unknown;
  link?: unknown;
  chunks?: unknown;
}

function toChunk(sourceId: string, index: number, candidate: CandidateChunk): MessageSourceChunk {
  const rawPreview =
    typeof candidate.preview === "string"
      ? candidate.preview
      : typeof candidate.text === "string"
        ? candidate.text
        : "";

  const preview = rawPreview.trim().slice(0, 220);

  return {
    id: typeof candidate.id === "string" ? candidate.id : `${sourceId}-${index}`,
    preview,
    score: typeof candidate.score === "number" ? candidate.score : undefined
  };
}

export function extractMessageSources(parts: unknown): MessageSourceGroup[] {
  if (!Array.isArray(parts)) {
    return [];
  }

  const groups: MessageSourceGroup[] = [];

  for (const part of parts) {
    if (!part || typeof part !== "object") {
      continue;
    }

    const candidate = part as { type?: unknown; data?: unknown; sources?: unknown };
    const payload = candidate.data ?? candidate.sources;
    if (candidate.type !== "data-sources" && candidate.type !== "source") {
      continue;
    }

    if (!Array.isArray(payload)) {
      continue;
    }

    for (const item of payload) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const source = item as CandidateSource;
      const title =
        (typeof source.fileName === "string" && source.fileName) ||
        (typeof source.title === "string" && source.title) ||
        (typeof source.source === "string" && source.source) ||
        "Source";
      const sourceId = title.toLowerCase().replace(/[^a-z0-9]+/gi, "-");

      const chunks = Array.isArray(source.chunks)
        ? source.chunks
            .filter((chunk): chunk is CandidateChunk => !!chunk && typeof chunk === "object")
            .map((chunk, index) => toChunk(sourceId, index, chunk))
            .filter((chunk) => chunk.preview.length > 0)
        : [];

      if (chunks.length === 0) {
        continue;
      }

      groups.push({
        id: sourceId,
        title,
        url:
          (typeof source.url === "string" && source.url) ||
          (typeof source.href === "string" && source.href) ||
          (typeof source.link === "string" && source.link) ||
          undefined,
        chunks
      });
    }
  }

  return groups;
}
