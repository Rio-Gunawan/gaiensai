import { db } from './db.ts';

const getTicket = db.prepare(
  'SELECT used_at, count FROM tickets WHERE id = ?;',
);
const insertTicket = db.prepare(
  'INSERT INTO tickets (id, used_at, count) VALUES (?, ?, ?)',
);
const updateTicket = db.prepare(
  'UPDATE tickets SET used_at = ?, count = ? WHERE id = ?',
);

const logScanStmt = db.prepare(`
INSERT INTO ticket_scan_logs (ticket_code, scanned_at, result, count)
VALUES (?, ?, ?, ?)
`);

const getEntryCountStmt = db.prepare('SELECT SUM(count) as total FROM tickets');
const getRecentLogsStmt = db.prepare(`
SELECT id, ticket_code, scanned_at, result, count FROM ticket_scan_logs
ORDER BY id DESC LIMIT 5
`);

const updateScanLogCountStmt = db.prepare(`
UPDATE ticket_scan_logs SET count = ? WHERE id = ?
`);

const updateTicketCountStmt = db.prepare(`
UPDATE tickets SET count = ? WHERE id = ?
`);

const getMaxScanLogCountStmt = db.prepare(`
SELECT MAX(count) as maxCount FROM ticket_scan_logs
WHERE ticket_code LIKE ? || '.%' OR ticket_code = ?
`);

export function checkTicketExists(id: string) {
  const existing = getTicket.get(id) as
    | { used_at: string; count: number }
    | undefined;
  return existing;
}

export function updateTicketUsedAndCount(id: string, count: number = 1) {
  const now = new Date().toISOString();
  const existing = checkTicketExists(id);

  if (existing) {
    // 人数の多い方を記録
    const maxCount = Math.max(existing.count, count);
    updateTicket.run(now, maxCount, id);
  }
}

export function useTicket(id: string, count: number = 1) {
  const existing = checkTicketExists(id);

  if (existing) {
    // 既存チケット、duplicate として返すのみ（tickets は更新しない）
    return { status: 'duplicate', usedAt: existing.used_at };
  }

  // 新規チケット、初回入場のみ tickets に挿入
  const now = new Date().toISOString();
  insertTicket.run(id, now, count);
  return { status: 'success', usedAt: null };
}

export function logTicketScan(code: string, result: string, count: number = 1) {
  const now = new Date().toISOString();
  const resultInfo = logScanStmt.run(code, now, result, count) as {
    lastInsertRowId?: number;
  };
  return resultInfo?.lastInsertRowId ?? null;
}

export function getEntryCount(): number {
  const result = getEntryCountStmt.get() as { total: number | null };
  return result.total ?? 0;
}

export function getRecentScanLogs() {
  const result = getRecentLogsStmt.all() as Array<{
    id: number;
    ticket_code: string;
    scanned_at: string;
    result: string;
    count: number;
  }>;
  return result;
}

export function updateScanLogCount(logId: number, count: number) {
  if (count < 1) {
    count = 1;
  }
  updateScanLogCountStmt.run(count, logId);
}

export function updateTicketCount(raw: string, count: number) {
  const code = raw.split('.')[0];

  if (count < 1) {
    count = 1;
  }

  // ticket_scan_logs から同じコードのレコードをすべて取得し、countの最大値を取得
  const scanLogResult = getMaxScanLogCountStmt.get(code, code) as
    | { maxCount: number | null }
    | undefined;
  const maxCount = scanLogResult?.maxCount ?? 0;

  updateTicketCountStmt.run(maxCount, code);
}
