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
