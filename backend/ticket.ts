import { db } from './db.ts';

const getTicket = db.prepare('SELECT used_at FROM tickets WHERE id = ?;');
const insertTicket = db.prepare(
  'INSERT INTO tickets (id, used_at) VALUES (?, ?)',
);
const updateTicket = db.prepare('UPDATE tickets SET used_at = ? WHERE id = ?');

const logScanStmt = db.prepare(`
INSERT INTO ticket_scan_logs (ticket_code, scanned_at, result)
VALUES (?, ?, ?)
`);

export function useTicket(id: string) {
  const now = new Date().toISOString();
  const existing = getTicket.get(id);

  if (existing) {
    // 既存チケット、再入場時に used_at を更新
    updateTicket.run(now, id);
    return { status: 'duplicate', usedAt: existing.used_at };
  }

  // 新規チケット、初回入場
  insertTicket.run(id, now);
  return { status: 'success', usedAt: null };
}

export function logTicketScan(code: string, result: string) {
  const now = new Date().toISOString();
  logScanStmt.run(code, now, result);
}
