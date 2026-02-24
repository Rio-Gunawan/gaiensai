const TICKET_CACHE_PREFIX = 'ticket-display-cache:v1:';

const getTicketCacheKey = (code: string): string =>
  `${TICKET_CACHE_PREFIX}${code}`;

export const readTicketDisplayCache = <T>(code: string): T | null => {
  try {
    const raw = window.localStorage.getItem(getTicketCacheKey(code));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { ticket?: T };
    return parsed.ticket ?? null;
  } catch {
    return null;
  }
};

export const writeTicketDisplayCache = <T>(code: string, ticket: T): void => {
  window.localStorage.setItem(
    getTicketCacheKey(code),
    JSON.stringify({
      ticket,
      cachedAt: Date.now(),
    }),
  );
};

export const listTicketDisplayCache = <T>(): T[] => {
  const items: Array<{ ticket: T; cachedAt: number }> = [];

  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key || !key.startsWith(TICKET_CACHE_PREFIX)) {
      continue;
    }

    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        continue;
      }
      const parsed = JSON.parse(raw) as { ticket?: T; cachedAt?: number };
      if (!parsed.ticket) {
        continue;
      }
      items.push({
        ticket: parsed.ticket,
        cachedAt: Number(parsed.cachedAt ?? 0),
      });
    } catch {
      // Ignore malformed entries.
    }
  }

  return items
    .sort((a, b) => b.cachedAt - a.cachedAt)
    .map((item) => item.ticket);
};
