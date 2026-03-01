import { Text } from "@cloudflare/kumo";

export interface CitationCardItem {
  id: string;
  title: string;
  preview: string;
  url?: string;
}

interface CitationCardsProps {
  items: CitationCardItem[];
}

export function CitationCards({ items }: CitationCardsProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 space-y-2 not-prose">
      <Text size="xs" bold>
        Citations
      </Text>
      {items.map((item) => (
        <article
          key={item.id}
          className="rounded-lg border border-kumo-line bg-kumo-control/35 px-3 py-2"
        >
          <div className="flex items-center justify-between gap-2">
            <Text size="xs" bold>
              {item.title}
            </Text>
            {item.url ? (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-kumo-accent hover:underline"
              >
                open
              </a>
            ) : null}
          </div>
          <span className="mt-1 block">
            <Text size="xs" variant="secondary">
              {item.preview}
            </Text>
          </span>
        </article>
      ))}
    </div>
  );
}
