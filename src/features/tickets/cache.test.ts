import { describe, it, expect, beforeEach } from 'vitest';
import {
  readTicketDisplayCache,
  writeTicketDisplayCache,
  listTicketDisplayCache,
  markTicketDisplayCacheCancelled,
} from './ticketDisplayCache';

describe('ticketDisplayCache', () => {
  const sample = { code: 'ABC', foo: 'bar' };

  beforeEach(() => {
    // clear localStorage before each test
    localStorage.clear();
  });

  it('can write and read an entry', () => {
    writeTicketDisplayCache(sample.code, sample);
    expect(readTicketDisplayCache<typeof sample>(sample.code)).toEqual(sample);
  });

  it('list returns entries in most-recent-first order', () => {
    // write two entries with explicit cachedAt timestamps to ensure ordering
    const now = Date.now();
    localStorage.setItem(
      'ticket-display-cache:v1:A',
      JSON.stringify({ ticket: { code: 'A' }, cachedAt: now }),
    );
    localStorage.setItem(
      'ticket-display-cache:v1:B',
      JSON.stringify({ ticket: { code: 'B' }, cachedAt: now + 1000 }),
    );
    const list = listTicketDisplayCache<{ code: string }>();
    expect(list.map((t) => t.code)).toEqual(['B', 'A']);
  });

  it('markTicketDisplayCacheCancelled sets status field', () => {
    // sample has extra fields, cast to unknown to satisfy generic
    writeTicketDisplayCache(sample.code, sample as unknown as { code: string });
    const before = readTicketDisplayCache<{ status?: string }>(sample.code);
    expect(before?.status).toBeUndefined();
    markTicketDisplayCacheCancelled(sample.code);
    const after = readTicketDisplayCache<{ status?: string }>(sample.code);
    expect(after?.status).toBe('cancelled');
  });
});
