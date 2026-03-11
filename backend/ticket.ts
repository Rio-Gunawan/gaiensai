import { db } from './db.ts';

const stmt = db.prepare(`
INSERT INTO tickets (id, used_at)
VALUES (?, ?)
ON CONFLICT DO NOTHING
RETURNING id
`);

export function useTicket(id: string) {
  const row = stmt.get(id, new Date().toISOString());

  if (!row) {
    return { status: 'duplicate' };
  }
  return { status: 'success' };
}
