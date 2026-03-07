import type { TicketCardStatus } from './IssuedTicketCardList';

const TICKET_CACHE_PREFIX = 'ticket-display-cache:v1:';
const TICKET_CACHE_UPDATED_EVENT = 'ticket-display-cache:updated';
const DEFAULT_TICKET_STATUS: TicketCardStatus = 'unknown';

const getTicketCacheKey = (code: string): string =>
  `${TICKET_CACHE_PREFIX}${code}`;

const isTicketCardStatus = (
  value: unknown,
): value is TicketCardStatus =>
  value === 'valid' ||
  value === 'cancelled' ||
  value === 'used' ||
  value === 'missing' ||
  value === 'unknown';

const normalizeCachedTicketStatus = <T>(ticket: T): T => {
  if (!ticket || typeof ticket !== 'object') {
    return ticket;
  }

  const rawStatus = (ticket as { status?: unknown }).status;
  const status = isTicketCardStatus(rawStatus)
    ? rawStatus
    : DEFAULT_TICKET_STATUS;

  return {
    ...(ticket as Record<string, unknown>),
    status,
  } as T;
};

const notifyTicketDisplayCacheUpdated = (code: string): void => {
  window.dispatchEvent(
    new CustomEvent<string>(TICKET_CACHE_UPDATED_EVENT, { detail: code }),
  );
};

export const subscribeTicketDisplayCacheUpdated = (
  callback: (code: string) => void,
): (() => void) => {
  const listener = (event: Event) => {
    const updatedCode = (event as CustomEvent<string>).detail;
    callback(updatedCode ?? '');
  };
  window.addEventListener(TICKET_CACHE_UPDATED_EVENT, listener);
  return () => {
    window.removeEventListener(TICKET_CACHE_UPDATED_EVENT, listener);
  };
};

export const readTicketDisplayCache = <T>(code: string): T | null => {
  try {
    const raw = window.localStorage.getItem(getTicketCacheKey(code));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { ticket?: T };
    if (!parsed.ticket) {
      return null;
    }
    return normalizeCachedTicketStatus(parsed.ticket);
  } catch {
    return null;
  }
};

export const writeTicketDisplayCache = <T>(code: string, ticket: T): void => {
  const normalizedTicket = normalizeCachedTicketStatus(ticket);
  window.localStorage.setItem(
    getTicketCacheKey(code),
    JSON.stringify({
      ticket: normalizedTicket,
      cachedAt: Date.now(),
    }),
  );
  notifyTicketDisplayCacheUpdated(code);
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
        ticket: normalizeCachedTicketStatus(parsed.ticket),
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

export const deleteTicketDisplayCache = (code: string): void => {
  try {
    window.localStorage.removeItem(getTicketCacheKey(code));
    notifyTicketDisplayCacheUpdated(code);
  } catch {
    // ignore
  }
};

export const markTicketDisplayCacheCancelled = (code: string): void => {
  try {
    const raw = window.localStorage.getItem(getTicketCacheKey(code));
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw) as {
      ticket?: Record<string, unknown>;
      cachedAt?: number;
    };
    if (!parsed.ticket) {
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (parsed.ticket as any).status = 'cancelled';
    window.localStorage.setItem(
      getTicketCacheKey(code),
      JSON.stringify(parsed),
    );
    notifyTicketDisplayCacheUpdated(code);
  } catch {
    // ignore
  }
};
