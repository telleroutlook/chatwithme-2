import { useMemo, useState } from "react";
import { CaretDownIcon, CaretRightIcon, FilesIcon } from "@phosphor-icons/react";
import { Text, Badge } from "@cloudflare/kumo";
import { extractMessageSources } from "../types/message-sources";

interface MessageSourcesProps {
  parts: unknown;
  title: string;
  emptyLabel: string;
}

export function MessageSources({ parts, title, emptyLabel }: MessageSourcesProps) {
  const groups = useMemo(() => extractMessageSources(parts), [parts]);
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});

  if (groups.length === 0) {
    return null;
  }

  const totalChunks = groups.reduce((sum, group) => sum + group.chunks.length, 0);

  return (
    <div className="mt-2 rounded-xl border border-[var(--app-border-default)] bg-[var(--app-surface-secondary)]/60 p-2.5">
      <div className="mb-2 flex items-center gap-2">
        <FilesIcon size={14} className="text-[var(--app-text-muted)]" />
        <Text size="xs" bold>
          {title}
        </Text>
        <Badge variant="secondary">{totalChunks}</Badge>
      </div>

      <div className="space-y-1.5">
        {groups.map((group) => {
          const open = !!openIds[group.id];
          return (
            <div key={group.id} className="rounded-lg border border-[var(--app-border-default)] bg-[var(--app-surface-primary)]/60">
              <button
                type="button"
                onClick={() => {
                  setOpenIds((current) => ({ ...current, [group.id]: !current[group.id] }));
                }}
                className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
                aria-expanded={open}
              >
                {open ? <CaretDownIcon size={12} /> : <CaretRightIcon size={12} />}
                <span className="truncate text-xs font-medium">{group.title}</span>
                <span className="ml-auto text-[11px] text-[var(--app-text-muted)]">{group.chunks.length}</span>
              </button>

              {open && (
                <div className="space-y-1 border-t border-[var(--app-border-default)] px-2.5 py-2">
                  {group.chunks.length === 0 ? (
                    <Text size="xs" variant="secondary">
                      {emptyLabel}
                    </Text>
                  ) : (
                    group.chunks.map((chunk) => (
                      <div key={chunk.id} className="rounded-md bg-[var(--app-surface-secondary)] px-2 py-1.5">
                        <Text size="xs" variant="secondary">
                          {chunk.preview}
                        </Text>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
