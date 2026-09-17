// db/restore.js — Restore the live DB from a ./backups/ snapshot.
// Usage:
//   npm run db:restore -- --list          list available snapshots
//   npm run db:restore                    restore the NEWEST snapshot
//   npm run db:restore -- <name>          restore a specific snapshot (full or partial name)
//   Add --yes to skip the confirmation prompt. Add --force to restore even
//   while the server appears to be running (NOT recommended).
//
// Safety:
//   1. Refuses to run while the server is listening (unless --force), because
//      overwriting the live file under a running server can corrupt it.
//      STOP the server (Ctrl+C) first, then restore, then start it again.
//   2. Takes a fresh safety backup of the CURRENT live DB before overwriting,
//      so a restore can always be undone.
//   3. Deletes stale -wal/-shm files after the copy so SQLite never applies
//      an old write-ahead log on top of the restored snapshot.
//   4. Verifies the snapshot (integrity_check) BEFORE copying it over live.

const path = require('path');
const fs = require('fs');
const net = require('net');
const readline = require('readline');
const { backupDir, createBackup } = require('./backup.js');

const LIVE_FILE = path.join(__dirname, 'store.db');
const args = process.argv.slice(2);
const YES = args.includes('--yes');
const FORCE = args.includes('--force');

function listBackups() {
  const dir = backupDir();
  let files = [];
  try {
    files = fs.readdirSync(dir)
      .filter((f) => /^store-.*\.db$/.test(f))
      .map((f) => {
        const full = path.join(dir, f);
        const st = fs.statSync(full);
        return { name: f, full, size: st.size, mtime: st.mtime };
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch (e) { /* no dir yet */ }
  return files;
}

function describeBackup(file) {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(file, { readonly: true });
    try {
      const orders = db.prepare('SELECT COUNT(*) AS c FROM orders').get().c;
      const products = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
      return `${orders} orders, ${products} products`;
    } finally {
      db.close();
    }
  } catch (e) {
    return 'unreadable (' + e.message + ')';
  }
}

function verifyBackup(file) {
  const Database = require('better-sqlite3');
  const db = new Database(file, { readonly: true });
  try {
    const row = db.prepare('PRAGMA integrity_check').get();
    if (!row || row.integrity_check !== 'ok') {
      throw new Error('integrity_check failed: ' + JSON.stringify(row));
    }
  } finally {
    db.close();
  }
}

// Best-effort check: is something listening on the app port? If so the
// server is probably still running and overwriting its live DB is unsafe.
function serverListening() {
  const port = Number(process.env.PORT) || 5000;
  return new Promise((resolve) => {
    const sock = net.connect(port, '127.0.0.1');
    const done = (v) => { try { sock.destroy(); } catch (e) {} resolve(v); };
    sock.on('connect', () => done(true));
    sock.on('error', () => done(false));
    sock.setTimeout(1500, () => done(false));
  });
}

function confirm(question) {
  if (YES) return Promise.resolve(true);
  if (!process.stdin.isTTY) {
    console.error('Refusing to restore without confirmation (no TTY). Re-run with --yes.');
    return Promise.resolve(false);
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (ans) => {
      rl.close();
      resolve(ans && ans.trim().toUpperCase() === 'RESTORE');
    });
  });
}

async function main() {
  const files = listBackups();

  if (args.includes('--list')) {
    if (!files.length) { console.log('No snapshots found in ' + backupDir()); return; }
    console.log('Available snapshots (newest first):');
    files.forEach((f, i) => {
      const kb = Math.round(f.size / 1024);
      console.log(`  ${i === 0 ? '*' : ' '} ${f.name}  (${kb} KB, ${f.mtime.toLocaleString()} — ${describeBackup(f.full)})`);
    });
    console.log('  * = newest (default restore target)');
    return;
  }

  if (!files.length) {
    console.error('No snapshots found in ' + backupDir() + '. Run `npm run db:backup` first.');
    process.exit(1);
  }

  // Pick target: explicit name/partial match, or newest.
  const nameArg = args.find((a) => !a.startsWith('--'));
  let target = files[0];
  if (nameArg) {
    target = files.find((f) => f.name === nameArg) || files.find((f) => f.name.includes(nameArg));
    if (!target) {
      console.error(`No snapshot matching "${nameArg}". Run with --list to see available snapshots.`);
      process.exit(1);
    }
  }

  console.log(`Snapshot:  ${target.name} (${describeBackup(target.full)})`);

  const liveExists = fs.existsSync(LIVE_FILE);
  if (liveExists && await serverListening() && !FORCE) {
    console.error('\nABORTED: something is listening on the app port — the server looks RUNNING.');
    console.error('Stop the server first (Ctrl+C), then restore. Override with --force at your own risk.');
    process.exit(1);
  }

  const ok = await confirm(`\nType "RESTORE" to overwrite the live DB with ${target.name}: `);
  if (!ok) { console.log('Aborted. Live DB untouched.'); process.exit(0); }

  // 1. Verify the snapshot before touching anything live.
  try {
    verifyBackup(target.full);
    console.log('Snapshot integrity: ok');
  } catch (e) {
    console.error('ABORTED: snapshot failed verification: ' + e.message);
    process.exit(1);
  }

  // 2. Safety backup of the current live DB (reversible restore).
  if (liveExists) {
    try {
      const safety = await createBackup();
      console.log('Safety backup of current live DB: ' + safety);
    } catch (e) {
      console.error('ABORTED: could not take a safety backup of the live DB: ' + e.message);
      process.exit(1);
    }
  }

  // 3. Copy snapshot over the live file, then drop stale WAL/SHM so the
  //    restored DB starts clean.
  fs.copyFileSync(target.full, LIVE_FILE);
  for (const suffix of ['-wal', '-shm', '-journal']) {
    try { fs.unlinkSync(LIVE_FILE + suffix); } catch (e) { /* may not exist */ }
  }

  // 4. Confirm the live file is the restored snapshot and healthy.
  verifyBackup(LIVE_FILE);
  console.log('Live DB now: ' + describeBackup(LIVE_FILE));
  console.log('\nRestore complete. Start the server with `npm run dev` (or `npm start`).');
}

main().catch((e) => { console.error('Restore failed: ' + (e && e.message ? e.message : e)); process.exit(1); });
