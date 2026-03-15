/* eslint-disable no-console */
import { db } from './db.ts';

const insertOperationLogStmt = db.prepare(`
INSERT INTO operation_logs (created_at, location, message, details)
VALUES (?, ?, ?, ?)
`);

function safeStringify(value: unknown) {
  if (value === undefined) {
    return null;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify(String(value));
  }
}

export function logOperation(
  location: string,
  message: string,
  ...details: unknown[]
) {
  const now = new Date().toISOString();
  const payload = details.length > 0 ? safeStringify(details) : null;

  insertOperationLogStmt.run(now, location, message, payload);
  console.log(message, ...details);
}
