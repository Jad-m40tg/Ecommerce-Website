// db/backup.js — Safe, online SQLite backups.
// Uses better-sqlite3's .backup() API which snapshots the DB **and** its WAL
// consistently, so it is safe to run WHILE the server is live (no data loss,
// no locking the server out). Backups land in ./backups/ and old ones are
// pruned to keep only the newest KEEP count.

const path = require('path');
const fs = require('fs');

const KEEP = 24; // keep the newest 24 backups

// Resolve the backup dir relative to the project root (works no matter the cwd).
function backupDir() {
  return path.join(__dirname, '..', 'backups');
}

// Produce a timestamped backup and prune old ones. Returns the written path.
// IMPORTANT: opens its OWN sqlite connection so it never closes the app's
// shared db connection (the singleton in db/index.js). This keeps backups safe
// to run on a timer / on startup while the server is live.
async function createBackup() {
  const Database = require('better-sqlite3');
  const sourceFile = path.join(__dirname, 'store.db');
  const dir = backupDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const file = path.join(dir, 'store-' + stamp + '.db');

  // Open a dedicated connection so we can back up the live file without
  // disturbing (or closing) the connection the running server uses.
  const conn = new Database(sourceFile, { readonly: false });
  try {
    await conn.backup(file);
  } finally {
    try { conn.close(); } catch (e) { /* ignore */ }
  }

  prune(dir, KEEP);
  return file;
}

function prune(dir, keep) {
  let files;
  try {
    files = fs.readdirSync(dir)
      .filter((f) => /^store-.*\.db$/.test(f))
      .map((f) => ({ name: f, time: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);
  } catch (e) {
    return;
  }
  for (const f of files.slice(keep)) {
    try { fs.unlinkSync(path.join(dir, f.name)); } catch (e) { /* ignore */ }
  }
}

module.exports = { createBackup, backupDir, KEEP };

// Allow direct invocation: node db/backup.js
if (require.main === module) {
  createBackup()
    .then((file) => { console.log('Backup written: ' + file); process.exit(0); })
    .catch((err) => { console.error('Backup failed: ' + err.message); process.exit(1); });
}
