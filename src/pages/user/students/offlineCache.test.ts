/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  readCachedTicketCards,
  writeCachedTicketCards,
  type StoredTicketCard,
  markCachedTicketCardCancelled,
} from './offlineCache';

describe('offlineCache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('write and read tickets', () => {
    const userId = 'user1';
    const tickets: StoredTicketCard[] = [
      { code: 'X' } as any,
      { code: 'Y' } as any,
    ];
    writeCachedTicketCards(userId, tickets);
    const read = readCachedTicketCards(userId);
    expect(read).toEqual(tickets);
  });

  it('markCachedTicketCardCancelled updates status only', () => {
    const userId = 'user2';
    const tickets: StoredTicketCard[] = [
      { code: 'A' } as any,
      { code: 'B' } as any,
      { code: 'C' } as any,
    ];
    writeCachedTicketCards(userId, tickets);
    markCachedTicketCardCancelled(userId, 'B');
    const read = readCachedTicketCards(userId);
    expect(read?.map((t) => ({ code: t.code, status: t.status }))).toEqual([
      { code: 'A', status: undefined },
      { code: 'B', status: 'cancelled' },
      { code: 'C', status: undefined },
    ]);
  });
});
