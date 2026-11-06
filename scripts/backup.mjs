import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, existsSync, chmodSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
const source = resolve(process.env.DATABASE_PATH || 'data/stacklane.sqlite');
const target = resolve(
  process.argv[2] || `backups/stacklane-${new Date().toISOString().replaceAll(':', '-')}.sqlite`,
);
if (!existsSync(source)) throw new Error('Source database does not exist');
if (existsSync(target) || target === source) throw new Error('Use a new backup path');
mkdirSync(dirname(target), { recursive: true });
const db = new DatabaseSync(source, { readOnly: true });
try {
  await backup(db, target);
  chmodSync(target, 0o600);
  console.log(`Backup written: ${target}`);
} finally {
  db.close();
}
