// Thali QR schema (D1) and DEMO seed data. Every name, price and table here is invented for the demo and labelled DEMO.
export const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, name_ne TEXT, sort INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS items (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     category_id INTEGER NOT NULL REFERENCES categories(id),
     name TEXT NOT NULL, name_ne TEXT, description TEXT NOT NULL DEFAULT '',
     price_npr INTEGER NOT NULL CHECK (price_npr >= 0 AND price_npr <= 100000),
     diet TEXT NOT NULL CHECK (diet IN ('veg','nonveg')),
     spice INTEGER NOT NULL DEFAULT 0 CHECK (spice BETWEEN 0 AND 3),
     available INTEGER NOT NULL DEFAULT 1,
     prep_min INTEGER NOT NULL DEFAULT 10,
     sort INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS items_cat ON items (category_id, sort)`,
  `CREATE TABLE IF NOT EXISTS tables_ (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, label TEXT NOT NULL, seats INTEGER NOT NULL DEFAULT 4, status TEXT NOT NULL DEFAULT 'free' CHECK (status IN ('free','occupied','bill_requested')))`,
  `CREATE TABLE IF NOT EXISTS bills (id INTEGER PRIMARY KEY AUTOINCREMENT, table_id INTEGER NOT NULL REFERENCES tables_(id), status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')), split_mode TEXT CHECK (split_mode IN ('equal','items') OR split_mode IS NULL), opened_at INTEGER NOT NULL, closed_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS bills_table ON bills (table_id, status)`,
  `CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, number INTEGER NOT NULL, bill_id INTEGER NOT NULL REFERENCES bills(id), table_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','cooking','ready','served')), note TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS orders_status ON orders (status, created_at)`,
  `CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES orders(id), item_id INTEGER NOT NULL REFERENCES items(id), name TEXT NOT NULL, diet TEXT NOT NULL, unit_price INTEGER NOT NULL, qty INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '')`,
  `CREATE INDEX IF NOT EXISTS order_items_order ON order_items (order_id)`,
  `CREATE TABLE IF NOT EXISTS shares (id INTEGER PRIMARY KEY AUTOINCREMENT, bill_id INTEGER NOT NULL REFERENCES bills(id), label TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('equal','items','extra','settled')), amount INTEGER NOT NULL CHECK (amount >= 0), status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','paid')), created_at INTEGER NOT NULL, paid_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS share_items (id INTEGER PRIMARY KEY AUTOINCREMENT, share_id INTEGER NOT NULL REFERENCES shares(id), item_id INTEGER NOT NULL REFERENCES items(id), qty INTEGER NOT NULL, unit_price INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS staff (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('kitchen','floor','manager')), is_demo INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, staff_id INTEGER NOT NULL REFERENCES staff(id), expires_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS login_fail (email TEXT NOT NULL, at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS login_fail_email ON login_fail (email, at)`,
  `CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '')`,
];

export const DEMO_RESTAURANT = { name: 'Sanjha Chulo (DEMO restaurant)', tagline: 'Shared hearth: thali, momo and curry, ordered from your table' };

export const DEMO_CATEGORIES: { name: string; name_ne: string }[] = [
  { name: 'Thali sets', name_ne: 'थाली सेट' },
  { name: 'Curries', name_ne: 'तरकारी' },
  { name: 'Momo and snacks', name_ne: 'मम र खाजा' },
  { name: 'Rice and bread', name_ne: 'भात र रोटी' },
  { name: 'Drinks', name_ne: 'पेय' },
  { name: 'Sweets', name_ne: 'मिठाई' },
];

// [category index, name, name_ne, description, price NPR, diet, spice, available, prep minutes]
export const DEMO_ITEMS: [number, string, string, string, number, 'veg' | 'nonveg', number, number, number][] = [
  [0, 'Veg dal bhat thali', 'शाकाहारी दाल भात थाली', 'Rice, lentil dal, seasonal tarkari, achar, salad, papad', 260, 'veg', 1, 1, 12],
  [0, 'Chicken dal bhat thali', 'कुखुरा दाल भात थाली', 'Rice, dal, chicken curry, tarkari, achar, salad', 380, 'nonveg', 2, 1, 15],
  [0, 'Mutton special thali', 'खसीको मासु थाली', 'Rice, dal, slow-cooked mutton, two tarkari, achar, sweet', 520, 'nonveg', 2, 1, 20],
  [1, 'Aloo tama', 'आलु तामा', 'Bamboo shoot and potato, mustard oil, cumin and timur', 220, 'veg', 2, 1, 14],
  [1, 'Kukhura ko masu', 'कुखुराको मासु', 'Bone-in chicken, onion, tomato and local masala', 320, 'nonveg', 3, 1, 18],
  [1, 'Paneer butter masala', 'पनीर बटर मसाला', 'Cottage cheese in a mild tomato and cashew gravy', 340, 'veg', 1, 1, 16],
  [1, 'Bhatmas ko jhol', 'भटमासको झोल', 'Black soybean in a thin spiced broth', 240, 'veg', 2, 1, 15],
  [2, 'Veg momo, steamed', 'शाकाहारी मम', 'Eight pieces, cabbage and carrot, tomato achar', 180, 'veg', 1, 1, 14],
  [2, 'Chicken jhol momo', 'कुखुरा झोल मम', 'Eight pieces in a sesame and tomato soup', 220, 'nonveg', 2, 1, 16],
  [2, 'Chicken sekuwa', 'कुखुरा सेकुवा', 'Four skewers, grilled over charcoal, sesame and chilli', 340, 'nonveg', 2, 0, 18],
  [2, 'Chatpate', 'चटपटे', 'Puffed rice, peanuts, potato, lemon and green chilli', 90, 'veg', 3, 1, 5],
  [3, 'Jeera rice', 'जिरा भात', 'Basmati with cumin', 120, 'veg', 0, 1, 8],
  [3, 'Garlic naan', 'लसुन नान', 'Tandoor-baked flatbread with garlic butter', 110, 'veg', 0, 1, 10],
  [3, 'Plain roti', 'रोटी', 'Two pieces, whole wheat', 60, 'veg', 0, 1, 6],
  [4, 'Masala chiya', 'मसला चिया', 'Spiced milk tea', 40, 'veg', 1, 1, 4],
  [4, 'Sweet lassi', 'गुलियो लस्सी', 'Yoghurt, sugar, cardamom', 150, 'veg', 0, 1, 4],
  [4, 'Cold coffee', 'कोल्ड कफी', 'Iced milk coffee', 200, 'veg', 0, 1, 5],
  [4, 'Lemon soda', 'लेमन सोडा', 'Sparkling water with lemon and black salt', 120, 'veg', 0, 1, 3],
  [5, 'Gulab jamun, two', 'गुलाब जामुन', 'Milk-solid dumplings in rose syrup', 120, 'veg', 0, 1, 4],
  [5, 'Kheer', 'खीर', 'Rice pudding with cardamom and nuts', 140, 'veg', 0, 1, 4],
];

export const DEMO_TABLES: { code: string; label: string; seats: number }[] = [
  { code: 'T1', label: 'Window 1', seats: 2 },
  { code: 'T2', label: 'Window 2', seats: 2 },
  { code: 'T3', label: 'Courtyard 1', seats: 4 },
  { code: 'T4', label: 'Courtyard 2', seats: 4 },
  { code: 'T5', label: 'Hearth', seats: 6 },
  { code: 'T6', label: 'Corner booth', seats: 6 },
];
