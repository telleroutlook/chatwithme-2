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
      <span className="text-xs font-bold text-foreground">
        Citations
      </span>
      {items.map((item) => (
        <article
          key={item.id}
          className="rounded-lg border border-border bg-muted/35 px-3 py-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-foreground">
              {item.title}
            </span>
            {item.url ? (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-accent-foreground hover:underline"
              >
                open
              </a>
            ) : null}
          </div>
          <span className="mt-1 block">
            <span className="text-xs text-foreground-muted">
              {item.preview}
            </span>
          </span>
        </article>
      ))}
    </div>
  );
}
