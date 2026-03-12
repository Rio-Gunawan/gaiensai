import { Database } from 'jsr:@db/sqlite@0.11.1';

await Deno.mkdir('./database', { recursive: true });

export const db = new Database('./database/tickets.db');

db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  used_at TEXT
)
`);

db.exec(`
CREATE TABLE IF NOT EXISTS ticket_scan_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_code TEXT NOT NULL,
  scanned_at TEXT NOT NULL,
  result TEXT NOT NULL
)
`);
