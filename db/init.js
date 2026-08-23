// db/init.js — Database initialization and seed data.
// Run with: npm run db:init
// Drops all existing tables, recreates them, and inserts sample data.
// WARNING: This destroys all existing data — only use during development setup.

require('dotenv').config();
const db = require('./index.js');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

try {
  // Drop existing tables in reverse dependency order (foreign keys reference admins).
  // This ensures a clean slate every time the command runs.
  db.exec(`
    DROP TABLE IF EXISTS reviews;
    DROP TABLE IF EXISTS sales;
    DROP TABLE IF EXISTS settings;
    DROP TABLE IF EXISTS orders;
    DROP TABLE IF EXISTS products;
    DROP TABLE IF EXISTS categories;
    DROP TABLE IF EXISTS admins;
  `);

  // Create the database schema.
  // Key design decisions:
  //   - prices stored as integers (price_cents) to avoid floating-point errors
  //   - arrays/objects (colors, sizes, tags, images, items) stored as JSON strings
  //   - token_version on admins table enables JWT revocation (bump to invalidate all tokens)
  //   - orders embed customer info directly (no customer accounts table)
  //   - settings is a key-value store for flexible store configuration
  db.exec(`
    CREATE TABLE admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      avatar TEXT DEFAULT '',
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      token_version INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      image TEXT DEFAULT '',
      description TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      price_cents INTEGER NOT NULL,
      old_price_cents INTEGER,
      category TEXT DEFAULT '',
      brand TEXT DEFAULT '',
      sku TEXT UNIQUE,
      stock INTEGER DEFAULT 0,
      colors TEXT DEFAULT '[]',
      sizes TEXT DEFAULT '[]',
      tags TEXT DEFAULT '[]',
      images TEXT DEFAULT '[]',
      specifications TEXT DEFAULT '[]',
      shipping_info TEXT DEFAULT '',
      returns_info TEXT DEFAULT '',
      featured INTEGER DEFAULT 0,
      on_sale INTEGER DEFAULT 0,
      free_delivery INTEGER DEFAULT 0,
      warranty_months INTEGER,
      display_section TEXT DEFAULT '',
      new_arrival_days INTEGER DEFAULT 3,
      new_arrival_until TEXT,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT DEFAULT '',
      customer_address TEXT DEFAULT '',
      customer_city TEXT DEFAULT '',
      items TEXT NOT NULL DEFAULT '[]',
      subtotal_cents INTEGER NOT NULL DEFAULT 0,
      delivery_fee_cents INTEGER NOT NULL DEFAULT 0,
      total_cents INTEGER NOT NULL DEFAULT 0,
      payment_status TEXT DEFAULT 'pending',
      payment_method TEXT DEFAULT 'cash_on_delivery',
      payment_reference TEXT DEFAULT '',
      payment_payload TEXT DEFAULT '',
      paid_at TEXT,
      order_status TEXT DEFAULT 'pending',
      notes TEXT DEFAULT '',
      tracking_number TEXT DEFAULT '',
      carrier TEXT DEFAULT '',
      tracking_url TEXT DEFAULT '',
      tracking_code TEXT DEFAULT '',
      noest_tracking TEXT DEFAULT '',
      noest_status TEXT DEFAULT '',
      noest_payload TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      customer_name TEXT NOT NULL,
      customer_email TEXT,
      rating INTEGER NOT NULL DEFAULT 5,
      comment TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      original_price_cents INTEGER NOT NULL,
      sale_price_cents INTEGER NOT NULL,
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      banner_image_url TEXT DEFAULT '',
      title TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // One review per customer per product.
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_once ON reviews(product_id, customer_email)');

  // Seed default admin account.
  // If SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are set in .env, uses those.
  // Otherwise generates a random password and logs it to the console.
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64url');
  const passwordHash = bcrypt.hashSync(adminPassword, 10);
  db.prepare(`
    INSERT INTO admins (email, name, avatar, password_hash, role)
    VALUES (?, ?, ?, ?, ?)
  `).run(adminEmail, 'Admin', '', passwordHash, 'admin');

  console.log('  - Admin credentials:');
    console.log('    Email: ' + adminEmail);
    console.log('    Password: ' + adminPassword);

  // Seed 8 product categories with slugs for URL-friendly names.
  const insertCategory = db.prepare(`
    INSERT INTO categories (name, slug, image, description, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `);

  const categories = [
    ['Living Room', 'living-room', '/assets/noImageForItem.jpg', 'Comfortable sofas, chairs, and coffee tables for your living space', 1],
    ['Bedroom', 'bedroom', '/assets/noImageForItem.jpg', 'Beds, nightstands, and wardrobes for restful nights', 2],
    ['Dining Room', 'dining-room', '/assets/noImageForItem.jpg', 'Dining tables, chairs, and sideboards for family meals', 3],
    ['Office', 'office', '/assets/noImageForItem.jpg', 'Desks, ergonomic chairs, and storage for productive workspaces', 4],
    ['Outdoor', 'outdoor', '/assets/noImageForItem.jpg', 'Patio furniture, garden seating, and weather-resistant pieces', 5],
    ['Storage', 'storage', '/assets/noImageForItem.jpg', 'Shelving units, cabinets, and organizational solutions', 6],
    ['Lighting', 'lighting', '/assets/noImageForItem.jpg', 'Floor lamps, pendants, and table lights to set the mood', 7],
    ['Decor', 'decor', '/assets/noImageForItem.jpg', 'Vases, wall art, and decorative accents to finish any room', 8],
  ];

  // Wrap all category inserts in a single transaction for performance.
  const insertCategories = db.transaction(() => {
    for (const cat of categories) {
      insertCategory.run(...cat);
    }
  });
  insertCategories();

  // Seed 10 sample furniture products.
  // All product names, descriptions, and brand names are PLACEHOLDER data
  // for the Boularas template store — will be replaced for the real store.
  const insertProduct = db.prepare(`
    INSERT INTO products (name, description, price_cents, old_price_cents, category, brand, sku, stock, colors, sizes, tags, images, featured, on_sale, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const products = [
    {
      name: 'Oslo Velvet Sofa',
      description: 'A mid-century modern 3-seater sofa upholstered in premium velvet. Solid oak legs and high-density foam cushions ensure lasting comfort and style.',
      price_cents: 129999,
      old_price_cents: null,
      category: 'living-room',
      brand: 'Boularas',
      sku: 'BL-SOF-001',
      stock: 12,
      colors: JSON.stringify(['Emerald Green', 'Dusty Rose', 'Charcoal', 'Navy']),
      sizes: JSON.stringify(['2-Seater', '3-Seater', 'L-Shape']),
      tags: JSON.stringify(['new-arrival', 'bestseller']),
      images: JSON.stringify(['/assets/noImageForItem.jpg']),
      featured: 1,
      on_sale: 0,
      status: 'active',
    },
    {
      name: 'Bergen Oak Dining Table',
      description: 'Solid white oak dining table with a natural grain finish. Seats 6 comfortably with clean Scandinavian lines and tapered legs.',
      price_cents: 89999,
      old_price_cents: 109999,
      category: 'dining-room',
      brand: 'Boularas',
      sku: 'BL-DIN-002',
      stock: 8,
      colors: JSON.stringify(['Natural Oak', 'Walnut']),
      sizes: JSON.stringify(['4-Seater', '6-Seater', '8-Seater']),
      tags: JSON.stringify(['on-sale', 'bestseller']),
      images: JSON.stringify(['/assets/noImageForItem.jpg']),
      featured: 1,
      on_sale: 1,
      status: 'active',
    },
    {
      name: 'Nordic Platform Bed',
      description: 'Minimalist platform bed frame with slatted support — no box spring needed. Available in warm walnut or matte black finish.',
      price_cents: 74999,
      old_price_cents: null,
      category: 'bedroom',
      brand: 'Boularas',
      sku: 'BL-BED-003',
      stock: 15,
      colors: JSON.stringify(['Walnut', 'Matte Black', 'White Oak']),
      sizes: JSON.stringify(['Full', 'Queen', 'King']),
      tags: JSON.stringify(['new-arrival']),
      images: JSON.stringify(['/assets/noImageForItem.jpg']),
      featured: 1,
      on_sale: 0,
      status: 'active',
    },
    {
      name: 'Zurich Ergonomic Office Chair',
      description: 'Fully adjustable ergonomic chair with lumbar support, breathable mesh back, and 4D armrests. Built for long work sessions.',
      price_cents: 54999,
      old_price_cents: 64999,
      category: 'office',
      brand: 'Boularas',
      sku: 'BL-OFC-004',
      stock: 20,
      colors: JSON.stringify(['Black', 'Space Gray', 'Cream']),
      sizes: JSON.stringify(['Standard']),
      tags: JSON.stringify(['on-sale']),
      images: JSON.stringify(['/assets/noImageForItem.jpg']),
      featured: 0,
      on_sale: 1,
      status: 'active',
    },
    {
      name: 'Aspen Teak Outdoor Lounge Set',
      description: 'Weather-resistant teak lounge set with all-weather cushions. Includes 2 armchairs, a 2-seater sofa, and a coffee table.',
      price_cents: 189999,
      old_price_cents: 229999,
      category: 'outdoor',
      brand: 'Boularas',
      sku: 'BL-OUT-005',
      stock: 5,
      colors: JSON.stringify(['Natural Teak', 'Grey Wash']),
      sizes: JSON.stringify(['3-Piece', '5-Piece']),
      tags: JSON.stringify(['premium', 'on-sale']),
      images: JSON.stringify(['/assets/noImageForItem.jpg']),
      featured: 1,
      on_sale: 1,
      status: 'active',
    },
    {
      name: 'Calabar Bookshelf',
      description: 'Industrial-style open bookshelf with powder-coated steel frame and solid pine shelves. 5 tiers of display and storage.',
      price_cents: 34999,
      old_price_cents: null,
      category: 'storage',
      brand: 'Boularas',
      sku: 'BL-STR-006',
      stock: 25,
      colors: JSON.stringify(['Black/Raw Pine', 'White/Pine', 'All Black']),
      sizes: JSON.stringify(['3-Tier', '5-Tier']),
      tags: JSON.stringify(['bestseller']),
      images: JSON.stringify(['/assets/noImageForItem.jpg']),
      featured: 0,
      on_sale: 0,
      status: 'active',
    },
    {
      name: 'Luna Arc Floor Lamp',
      description: 'Sculptural arc floor lamp with a linen drum shade and weighted marble base. Dimmable LED compatible.',
      price_cents: 19999,
      old_price_cents: 24999,
      category: 'lighting',
      brand: 'Boularas',
      sku: 'BL-LGT-007',
      stock: 30,
      colors: JSON.stringify(['Brushed Brass', 'Matte Black', 'Chrome']),
      sizes: JSON.stringify(['Standard']),
      tags: JSON.stringify(['on-sale']),
      images: JSON.stringify(['/assets/noImageForItem.jpg']),
      featured: 0,
      on_sale: 1,
      status: 'active',
    },
    {
      name: 'Sienna Ceramic Vase Set',
      description: 'Handcrafted set of 3 artisan ceramic vases in earthy tones. Each piece is unique with organic shapes and matte finish.',
      price_cents: 5999,
      old_price_cents: null,
      category: 'decor',
      brand: 'Boularas',
      sku: 'BL-DEC-008',
      stock: 40,
      colors: JSON.stringify(['Terracotta', 'Sage', 'Sand']),
      sizes: JSON.stringify(['Set of 3']),
      tags: JSON.stringify(['new-arrival', 'gift-idea']),
      images: JSON.stringify(['/assets/noImageForItem.jpg']),
      featured: 1,
      on_sale: 0,
      status: 'active',
    },
    {
      name: 'Milano Writing Desk',
      description: 'Sleek writing desk with a single drawer and cable management cutout. Perfect for home offices and small spaces.',
      price_cents: 42999,
      old_price_cents: null,
      category: 'office',
      brand: 'Boularas',
      sku: 'BL-OFC-009',
      stock: 18,
      colors: JSON.stringify(['Walnut', 'White', 'Black Oak']),
      sizes: JSON.stringify(['100cm', '120cm']),
      tags: JSON.stringify([]),
      images: JSON.stringify(['/assets/noImageForItem.jpg']),
      featured: 0,
      on_sale: 0,
      status: 'active',
    },
    {
      name: 'Haven Linen Nightstand',
      description: 'Compact 2-drawer nightstand with soft-close runners and linen-wrapped frame. Subtle brass knob hardware.',
      price_cents: 24999,
      old_price_cents: 29999,
      category: 'bedroom',
      brand: 'Boularas',
      sku: 'BL-BED-010',
      stock: 0,
      colors: JSON.stringify(['Linen Beige', 'Charcoal Linen']),
      sizes: JSON.stringify(['Standard']),
      tags: JSON.stringify(['on-sale', 'out-of-stock']),
      images: JSON.stringify(['/assets/noImageForItem.jpg']),
      featured: 0,
      on_sale: 1,
      status: 'draft',
    },
  ];

  // Wrap all product inserts in a transaction for performance.
  const insertProducts = db.transaction(() => {
    for (const p of products) {
      insertProduct.run(
        p.name, p.description, p.price_cents, p.old_price_cents,
        p.category, p.brand, p.sku, p.stock,
        p.colors, p.sizes, p.tags, p.images,
        p.featured, p.on_sale, p.status
      );
    }
  });
  insertProducts();

  // Seed default store settings (key-value pairs).
  // These control store name, tagline, currency, delivery fees, and contact info.
  // Admin can update all of these from the settings page.
  const insertSetting = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
  `);

  const settings = [
    ['store_name', 'Boularas'],
    ['store_tagline', 'Premium Furniture & Home'],
    ['currency', 'DZD'],
    ['delivery_fee_cents', '999'],
    ['free_delivery_threshold_cents', '9999'],
    ['contact_email', 'support@boularas.com'],
    ['contact_phone', '+1 (555) 123-4567'],
    ['store_address', '123 Boularas Lane, Furniture District'],
    ['perks_free_delivery', 'false'],
    ['perks_warranty_months', '12'],
    ['perks_returns_days', '30'],
    ['announcement_text', 'Free Delivery Over 66,700 DA'],
    ['announcement_enabled', 'true'],
  ];

  // Wrap all setting inserts in a transaction.
  const insertSettings = db.transaction(() => {
    for (const [key, value] of settings) {
      insertSetting.run(key, value);
    }
  });
  insertSettings();

  console.log('Database initialized successfully.');
  console.log('  - 1 admin account');
  console.log('  - 8 categories');
  console.log('  - 10 sample products');
  console.log('  - 13 default settings');
} catch (err) {
  console.error('Database initialization failed:', err.message);
  process.exit(1);
}
