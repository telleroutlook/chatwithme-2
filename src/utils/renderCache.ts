/**
 * Render Cache
 * LRU cache for rendered content with TTL support
 */

interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

class RenderCache<T = string> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number;
  private ttl: number;

  constructor(maxSize = 100, ttl = 30 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  get(key: string): T | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return cached.value;
  }

  set(key: string, value: T): void {
    // LRU eviction
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, { value, timestamp: Date.now() });
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  /**
   * Generate a hash key from content, language, and theme
   */
  static hash(content: string, lang: string, theme: string): string {
    let hash = 0;
    const str = `${lang}:${theme}:${content}`;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return `${lang}:${theme}:${hash.toString(36)}`;
  }

  /**
   * Clean up expired entries
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number; ttl: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttl: this.ttl,
    };
  }
}

// Global cache instances
export const htmlRenderCache = new RenderCache<string>(100, 30 * 60 * 1000);
export const codeHighlightCache = new RenderCache<string>(200, 30 * 60 * 1000);
export const chartRenderCache = new RenderCache<string>(50, 30 * 60 * 1000);

export { RenderCache };
