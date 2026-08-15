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
  returns_info: "ALTER TABLE products ADD COLUMN returns_info TEXT DEFAULT ''",
  display_section: "ALTER TABLE products ADD COLUMN display_section TEXT DEFAULT ''"
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

const orderColumns = db.pragma('table_info(orders)').map((col) => col.name);
const orderMigrations = {
  payment_method: "ALTER TABLE orders ADD COLUMN payment_method TEXT DEFAULT 'cash_on_delivery'",
  payment_reference: "ALTER TABLE orders ADD COLUMN payment_reference TEXT DEFAULT ''",
  payment_payload: "ALTER TABLE orders ADD COLUMN payment_payload TEXT DEFAULT ''",
  paid_at: "ALTER TABLE orders ADD COLUMN paid_at TEXT",
  tracking_number: "ALTER TABLE orders ADD COLUMN tracking_number TEXT DEFAULT ''",
  carrier: "ALTER TABLE orders ADD COLUMN carrier TEXT DEFAULT ''",
  tracking_url: "ALTER TABLE orders ADD COLUMN tracking_url TEXT DEFAULT ''",
  tracking_code: "ALTER TABLE orders ADD COLUMN tracking_code TEXT DEFAULT ''",
  noest_tracking: "ALTER TABLE orders ADD COLUMN noest_tracking TEXT DEFAULT ''",
  noest_status: "ALTER TABLE orders ADD COLUMN noest_status TEXT DEFAULT ''",
  noest_payload: "ALTER TABLE orders ADD COLUMN noest_payload TEXT DEFAULT ''"
};
for (const [name, sql] of Object.entries(orderMigrations)) {
  if (!orderColumns.includes(name)) {
    try {
      db.exec(sql);
    } catch (err) {
      console.error('Migration failed for orders.' + name + ':', err.message);
    }
  }
}

// Create hidden_customers table if it doesn't exist
// Used to soft-hide customers from the admin UI without deleting their orders
db.exec(`CREATE TABLE IF NOT EXISTS hidden_customers (
  email TEXT PRIMARY KEY,
  hidden_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Create sales table if it doesn't exist (added in STEP 2 of the sales feature).
// One record per product per date range; active = now within [start_at, end_at].
db.exec(`CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  original_price_cents INTEGER NOT NULL,
  sale_price_cents INTEGER NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  banner_image_url TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Idempotent migration — adds columns to sales tables that predate later steps.
const salesColumns = db.pragma('table_info(sales)').map((col) => col.name);
const salesMigrations = {
  banner_image_url: "ALTER TABLE sales ADD COLUMN banner_image_url TEXT DEFAULT ''"
};
for (const [name, sql] of Object.entries(salesMigrations)) {
  if (!salesColumns.includes(name)) {
    try {
      db.exec(sql);
    } catch (err) {
      console.error('Migration failed for sales.' + name + ':', err.message);
    }
  }
}

module.exports = db;
