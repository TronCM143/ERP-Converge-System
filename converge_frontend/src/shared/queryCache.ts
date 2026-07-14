// In-memory cache for fetched page data (clients, products, quotations).
//
// Pattern: stale-while-revalidate. Pages seed their state from this cache so
// returning to a page renders instantly with the last-known data (no loading
// flash), then refetch in the background and update both the state and the
// cache. The cache lives for the browser session; a full reload starts empty.

const store = new Map<string, unknown>();

export const queryCache = {
  get<T>(key: string): T | undefined {
    return store.get(key) as T | undefined;
  },

  set(key: string, value: unknown): void {
    store.set(key, value);
  },

  /** Remove every entry whose key starts with the given prefix. */
  invalidate(prefix: string): void {
    for (const key of store.keys()) {
      if (key.startsWith(prefix)) store.delete(key);
    }
  }
};

export const CACHE_KEYS = {
  clients: 'clients',
  products: 'products',
  quotationsAll: 'quotations:all',
  quotationsForClient: (clientId: number) => `quotations:client:${clientId}`
};
