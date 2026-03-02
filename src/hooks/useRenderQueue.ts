import { useRef, useCallback } from "react";

interface RenderTask {
  id: string;
  priority: number;
  render: () => Promise<void>;
}

interface UseRenderQueueOptions {
  concurrency?: number;
}

interface UseRenderQueueResult {
  add: (id: string, priority: number, render: () => Promise<void>) => void;
  flush: (id?: string) => void;
  clear: () => void;
  hasPendingTasks: () => boolean;
}

export function useRenderQueue({
  concurrency = 2,
}: UseRenderQueueOptions): UseRenderQueueResult {
  const queueRef = useRef<RenderTask[]>([]);
  const processingRef = useRef(false);

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;

    processingRef.current = true;

    while (queueRef.current.length > 0) {
      const task = queueRef.current.shift()!;
      try {
        await task.render();
        // Let other tasks run
        await new Promise<void>((resolve) => {
          if (typeof requestIdleCallback !== "undefined") {
            requestIdleCallback(() => resolve());
          } else {
            setTimeout(resolve, 0);
          }
        });
      } catch (err) {
        console.error("Render task failed:", err);
      }
    }

    processingRef.current = false;
    processQueue();
  }, []);

  const add = useCallback((id: string, priority: number, render: () => Promise<void>) => {
    queueRef.current.push({ id, priority, render });
    // Sort by priority (highest first)
    queueRef.current.sort((a, b) => b.priority - a.priority);

    if (!processingRef.current) {
      processQueue();
    }
  }, [processQueue]);

  const flush = useCallback((id?: string) => {
    if (id) {
      // Remove specific task
      queueRef.current = queueRef.current.filter((task) => task.id !== id);
    } else {
      // Remove all tasks
      queueRef.current = [];
    }
  }, []);

  const clear = useCallback(() => {
    queueRef.current = [];
    processingRef.current = false;
  }, []);

  const hasPendingTasks = useCallback(() => queueRef.current.length > 0, []);

  return {
    add,
    flush,
    clear,
    hasPendingTasks,
  };
}
