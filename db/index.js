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

// Idempotent schema migration — adds new columns to existing databases
// without wiping data. Safe to run on every boot.
const productColumns = db.pragma('table_info(products)').map((col) => col.name);
const columnMigrations = {
  specifications: "ALTER TABLE products ADD COLUMN specifications TEXT DEFAULT '[]'",
  shipping_info: "ALTER TABLE products ADD COLUMN shipping_info TEXT DEFAULT ''",
  returns_info: "ALTER TABLE products ADD COLUMN returns_info TEXT DEFAULT ''"
};
for (const [name, sql] of Object.entries(columnMigrations)) {
  if (!productColumns.includes(name)) {
    try {
      db.exec(sql);
    } catch (err) {
      console.error('Migration failed for products.' + name + ':', err.message);
    }
  }
}

module.exports = db;
