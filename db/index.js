// db/index.js — Creates and exports the SQLite database connection.
// Every file that needs the database does: const db = require('../db')

const Database = require('better-sqlite3');
const path = require('path');

// Opens (or creates) the database file at db/store.db
const db = new Database(path.join(__dirname, 'store.db'));

// WAL mode = faster reads (multiple pages can load at once)
db.pragma('journal_mode = WAL');
// foreign_keys = ON means if you reference a product ID in orders,
// SQLite will reject the insert if that product doesn't exist
db.pragma('foreign_keys = ON');

module.exports = db;
