// Thali QR API: one Cloudflare Worker over D1. Serves /api/* and the SPA shell; everything else is a static asset.
import { SCHEMA, DEMO_RESTAURANT, DEMO_CATEGORIES, DEMO_ITEMS, DEMO_TABLES } from './schema.ts';
import { hashPassword, verifyPassword, randomToken, sha256hex, temporaryPassword } from './crypto.ts';
import * as L from '../../shared/logic.ts';

export interface Env {
  DB: any;
  ASSETS: { fetch(req: Request): Promise<Response> };
}

export const SESSION_COOKIE = 'thali_sid';
// Screens the app shell serves: the start page, staff sign-in and screens, the legal pages, and a table code.
const SPA_PATHS = /^\/(?:|login|kitchen|floor|manage|terms|privacy|t\/[A-Za-z0-9]{1,6})\/?$/;
const SESSION_MS = 12 * 3600 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILS = 8;

export class HttpError extends Error {
  status: number;
  code: string;
  extra: Record<string, unknown>;
  constructor(status: number, code: string, extra: Record<string, unknown> = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}
function fail(status: number, code: string, extra: Record<string, unknown> = {}): never {
  throw new HttpError(status, code, extra);
}

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-Frame-Options': 'DENY',
};

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...headers },
  });
}

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

const sessionCookie = (token: string, maxAgeS: number) =>
  `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeS}`;

// ---------- D1 helpers ----------
async function one<T = any>(env: Env, sql: string, ...args: unknown[]): Promise<T | null> {
  return (await env.DB.prepare(sql).bind(...args).first()) as T | null;
}
async function all<T = any>(env: Env, sql: string, ...args: unknown[]): Promise<T[]> {
  const r = await env.DB.prepare(sql).bind(...args).all();
  return (r.results || []) as T[];
}
async function run(env: Env, sql: string, ...args: unknown[]) {
  return env.DB.prepare(sql).bind(...args).run();
}
async function audit(env: Env, actor: string, action: string, detail = '') {
  await run(env, 'INSERT INTO audit (at, actor, action, detail) VALUES (?,?,?,?)', Date.now(), actor, action, detail.slice(0, 300));
}

const readyFor = new WeakMap<object, Promise<void>>();
export function ensureReady(env: Env): Promise<void> {
  let p = readyFor.get(env.DB);
  if (!p) {
    p = setup(env).catch((e) => {
      readyFor.delete(env.DB);
      throw e;
    });
    readyFor.set(env.DB, p);
  }
  return p;
}

async function setting(env: Env, k: string): Promise<string | null> {
  const r = await one<{ v: string }>(env, 'SELECT v FROM settings WHERE k = ?', k);
  return r ? r.v : null;
}
async function restaurant(env: Env) {
  const name = (await setting(env, 'restaurant_name')) || DEMO_RESTAURANT.name;
  const tax = Number(await setting(env, 'tax_pct'));
  const svc = Number(await setting(env, 'service_pct'));
  return {
    name,
    tax_pct: Number.isInteger(tax) ? tax : L.DEFAULT_TAX_PCT,
    service_pct: Number.isInteger(svc) ? svc : L.DEFAULT_SERVICE_PCT,
    currency: 'NPR',
    demo: true,
  };
}

async function setup(env: Env): Promise<void> {
  for (const stmt of SCHEMA) await env.DB.prepare(stmt).run();
  if (await setting(env, 'seeded')) return;
  await seed(env);
}

async function seed(env: Env): Promise<void> {
  const now = Date.now();
  await run(env, 'INSERT OR REPLACE INTO settings (k, v) VALUES (?, ?)', 'restaurant_name', DEMO_RESTAURANT.name);
  await run(env, 'INSERT OR REPLACE INTO settings (k, v) VALUES (?, ?)', 'tax_pct', String(L.DEFAULT_TAX_PCT));
  await run(env, 'INSERT OR REPLACE INTO settings (k, v) VALUES (?, ?)', 'service_pct', String(L.DEFAULT_SERVICE_PCT));
  for (let i = 0; i < DEMO_CATEGORIES.length; i++) {
    await run(env, 'INSERT INTO categories (name, name_ne, sort) VALUES (?,?,?)', DEMO_CATEGORIES[i].name, DEMO_CATEGORIES[i].name_ne, i);
  }
  const cats = await all<{ id: number }>(env, 'SELECT id FROM categories ORDER BY sort');
  let sort = 0;
  for (const [ci, name, name_ne, desc, price, diet, spice, avail, prep] of DEMO_ITEMS) {
    await run(env, 'INSERT INTO items (category_id, name, name_ne, description, price_npr, diet, spice, available, prep_min, sort) VALUES (?,?,?,?,?,?,?,?,?,?)', cats[ci].id, name, name_ne, desc, price, diet, spice, avail, prep, sort++);
  }
  for (const t of DEMO_TABLES) {
    await run(env, 'INSERT INTO tables_ (code, label, seats, status) VALUES (?,?,?,?)', t.code, t.label, t.seats, 'free');
  }
  // Demo staff: one tap sign-in only; nobody learns a password for them.
  for (const s of [
    { email: 'kitchen.demo@thali.invalid', name: 'Demo kitchen', role: 'kitchen' },
    { email: 'floor.demo@thali.invalid', name: 'Demo floor', role: 'floor' },
    { email: 'manager.demo@thali.invalid', name: 'Demo manager', role: 'manager' },
  ]) {
    await run(env, 'INSERT INTO staff (email, name, password_hash, role, is_demo, created_at) VALUES (?,?,?,?,1,?)', s.email, s.name, await hashPassword(randomToken(24)), s.role, now);
  }
  // A busy evening so the kitchen and floor screens show real states on first open: table T3 (two tickets) and T5 (served, split by three).
  const t3 = await one<{ id: number }>(env, "SELECT id FROM tables_ WHERE code = 'T3'");
  const t5 = await one<{ id: number }>(env, "SELECT id FROM tables_ WHERE code = 'T5'");
  const itemId = async (name: string) => (await one<{ id: number }>(env, 'SELECT id FROM items WHERE name = ?', name))!.id;
  const seedOrder = async (tableId: number, status: string, minsAgo: number, lines: [string, number, string][]) => {
    const bill = await billOpenOrCreate(env, tableId, now - minsAgo * 60000);
    const num = (await one<{ n: number }>(env, 'SELECT COALESCE(MAX(number),0)+1 AS n FROM orders'))!.n;
    const oid = (await run(env, 'INSERT INTO orders (number, bill_id, table_id, status, note, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', num, bill, tableId, status, '', now - minsAgo * 60000, now - (minsAgo - 2) * 60000)).meta.last_row_id;
    for (const [name, qty, note] of lines) {
      const iid = await itemId(name);
      const it = (await one<{ name: string; diet: string; price_npr: number }>(env, 'SELECT name, diet, price_npr FROM items WHERE id = ?', iid))!;
      await run(env, 'INSERT INTO order_items (order_id, item_id, name, diet, unit_price, qty, note) VALUES (?,?,?,?,?,?,?)', oid, iid, it.name, it.diet, it.price_npr, qty, note);
    }
  };
  await seedOrder(t3!.id, 'cooking', 14, [['Veg dal bhat thali', 2, ''], ['Masala chiya', 2, 'Less sugar']]);
  await seedOrder(t3!.id, 'ready', 22, [['Chicken jhol momo', 1, 'Extra achar']]);
  await run(env, "UPDATE tables_ SET status = 'occupied' WHERE id = ?", t3!.id);
  await seedOrder(t5!.id, 'served', 55, [['Mutton special thali', 3, ''], ['Sweet lassi', 3, ''], ['Gulab jamun, two', 1, '']]);
  await run(env, "UPDATE tables_ SET status = 'bill_requested' WHERE id = ?", t5!.id);
  const b5 = await one<{ id: number }>(env, 'SELECT id FROM bills WHERE table_id = ? AND status = ?', t5!.id, 'open');
  const r = await restaurant(env);
  const tot = L.computeBill(await billSubtotal(env, b5!.id), r.service_pct, r.tax_pct);
  const parts = L.splitEqual(tot.total, 3);
  await run(env, "UPDATE bills SET split_mode = 'equal' WHERE id = ?", b5!.id);
  for (let i = 0; i < 3; i++) {
    await run(env, "INSERT INTO shares (bill_id, label, kind, amount, status, created_at, paid_at) VALUES (?,?,?,?,?,?,?)", b5!.id, `Person ${i + 1} of 3`, 'equal', parts[i], i === 0 ? 'paid' : 'open', now, i === 0 ? now : null);
  }
  await run(env, 'INSERT INTO settings (k, v) VALUES (?, ?)', 'seeded', '1');
}

// ---------- bill rules over D1 ----------
async function billOpenOrCreate(env: Env, tableId: number, at: number): Promise<number> {
  const open = await one<{ id: number }>(env, "SELECT id FROM bills WHERE table_id = ? AND status = 'open'", tableId);
  if (open) return open.id;
  return Number((await run(env, 'INSERT INTO bills (table_id, status, split_mode, opened_at) VALUES (?,?,NULL,?)', tableId, 'open', at)).meta.last_row_id);
}

async function billSubtotal(env: Env, billId: number): Promise<number> {
  const r = await one<{ s: number }>(env, 'SELECT COALESCE(SUM(oi.qty * oi.unit_price), 0) AS s FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.bill_id = ?', billId);
  return Number(r?.s || 0);
}

interface BillLine { lkey: number; item_id: number; name: string; diet: string; unit_price: number; ordered: number; claimed: number }

/** Lines are keyed by item and price (item_id * 100000 + unit_price) so a price change in the middle of a night never mixes two claims. */
async function billLines(env: Env, billId: number): Promise<BillLine[]> {
  const rows = await all<{ item_id: number; name: string; diet: string; unit_price: number; ordered: number }>(
    env,
    `SELECT oi.item_id, MAX(oi.name) AS name, MAX(oi.diet) AS diet, oi.unit_price, SUM(oi.qty) AS ordered
       FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.bill_id = ? GROUP BY oi.item_id, oi.unit_price ORDER BY MAX(oi.name)`,
    billId,
  );
  const claimed = await all<{ item_id: number; unit_price: number; q: number }>(
    env,
    `SELECT si.item_id, si.unit_price, SUM(si.qty) AS q FROM share_items si JOIN shares s ON s.id = si.share_id WHERE s.bill_id = ? AND s.kind = 'items' GROUP BY si.item_id, si.unit_price`,
    billId,
  );
  const cmap = new Map(claimed.map((c) => [c.item_id * 100000 + c.unit_price, Number(c.q)]));
  return rows.map((r) => {
    const lkey = r.item_id * 100000 + r.unit_price;
    return { lkey, item_id: r.item_id, name: r.name, diet: r.diet, unit_price: r.unit_price, ordered: Number(r.ordered), claimed: cmap.get(lkey) || 0 };
  });
}

async function billView(env: Env, bill: { id: number; split_mode: string | null; status: string }) {
  const r = await restaurant(env);
  const lines = await billLines(env, bill.id);
  const subtotal = lines.reduce((s, l) => s + l.ordered * l.unit_price, 0);
  const totals = L.computeBill(subtotal, r.service_pct, r.tax_pct);
  const shares = await all<{ id: number; label: string; kind: string; amount: number; status: string }>(env, 'SELECT id, label, kind, amount, status FROM shares WHERE bill_id = ? ORDER BY id', bill.id);
  const itemsOf = await all<{ share_id: number; name: string; qty: number }>(
    env,
    'SELECT si.share_id, i.name, si.qty FROM share_items si JOIN items i ON i.id = si.item_id JOIN shares s ON s.id = si.share_id WHERE s.bill_id = ? ORDER BY si.id',
    bill.id,
  );
  const covered = shares.reduce((s, x) => s + Number(x.amount), 0);
  const paid = shares.filter((x) => x.status === 'paid').reduce((s, x) => s + Number(x.amount), 0);
  return {
    bill_id: bill.id,
    status: bill.status,
    split_mode: bill.split_mode,
    lines: lines.map((l) => ({ line_key: l.lkey, name: l.name, diet: l.diet, unit_price: l.unit_price, ordered: l.ordered, claimed: l.claimed, remaining: l.ordered - l.claimed })),
    totals,
    fully_claimed: L.fullyClaimed(lines.map((l) => ({ item_id: l.lkey, ordered: l.ordered, claimed: l.claimed, unit_price: l.unit_price }))),
    shares: shares.map((s) => ({
      id: s.id,
      label: s.label,
      kind: s.kind,
      amount: Number(s.amount),
      status: s.status,
      items: itemsOf.filter((i) => i.share_id === s.id).map((i) => ({ name: i.name, qty: Number(i.qty) })),
    })),
    covered_npr: covered,
    paid_npr: paid,
    uncovered_npr: Math.max(0, totals.total - covered),
    due_npr: Math.max(0, totals.total - paid),
  };
}

async function billRow(env: Env, id: number) {
  const r = await one<{ id: number; split_mode: string | null; status: string }>(env, 'SELECT id, split_mode, status FROM bills WHERE id = ?', id);
  if (!r) fail(404, 'not_found');
  return r;
}

async function openBillFor(env: Env, code: string) {
  const t = await one<{ id: number; code: string; label: string; seats: number; status: string }>(env, 'SELECT id, code, label, seats, status FROM tables_ WHERE code = ?', code);
  if (!t) fail(404, 'table_not_found');
  return t;
}

// ---------- staff sessions ----------
async function currentStaff(env: Env, req: Request): Promise<{ id: number; name: string; email: string; role: string } | null> {
  const tok = readCookie(req, SESSION_COOKIE);
  if (!tok) return null;
  const h = await sha256hex(tok);
  const row = await one<{ id: number; name: string; email: string; role: string; expires_at: number }>(
    env,
    'SELECT st.id, st.name, st.email, st.role, s.expires_at FROM sessions s JOIN staff st ON st.id = s.staff_id WHERE s.token_hash = ?',
    h,
  );
  if (!row || row.expires_at < Date.now()) return null;
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}
async function requireStaff(env: Env, req: Request, need: 'kitchen' | 'floor' | 'manager') {
  const s = await currentStaff(env, req);
  if (!s) fail(401, 'sign_in_required');
  if (!L.can(s.role, need)) fail(403, 'role_not_allowed');
  return s;
}
async function startSession(env: Env, staffId: number): Promise<Response> {
  const tok = randomToken(32);
  await run(env, 'INSERT INTO sessions (token_hash, staff_id, expires_at) VALUES (?,?,?)', await sha256hex(tok), staffId, Date.now() + SESSION_MS);
  const st = await one<{ name: string; role: string }>(env, 'SELECT name, role FROM staff WHERE id = ?', staffId);
  return json({ ok: true, staff: { name: st!.name, role: st!.role } }, 200, { 'Set-Cookie': sessionCookie(tok, SESSION_MS / 1000) });
}

// ---------- routing ----------
async function readBody(req: Request): Promise<Record<string, any>> {
  const ct = req.headers.get('Content-Type') || '';
  if (!ct.includes('application/json')) fail(415, 'json_required');
  const text = await req.text();
  if (text.length > 60000) fail(413, 'too_large');
  try {
    const v = text ? JSON.parse(text) : {};
    if (!v || typeof v !== 'object' || Array.isArray(v)) fail(422, 'body_invalid');
    return v;
  } catch {
    return fail(422, 'body_invalid');
  }
}

async function handleApi(req: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const m = req.method;
  const now = Date.now();
  const body = async () => readBody(req);

  // --- public menu and table ---
  if (path === '/api/menu' && m === 'GET') {
    const r = await restaurant(env);
    const cats = await all<{ id: number; name: string; name_ne: string }>(env, 'SELECT id, name, name_ne FROM categories ORDER BY sort, id');
    const items = await all<any>(env, 'SELECT id, category_id, name, name_ne, description, price_npr, diet, spice, available, prep_min FROM items ORDER BY sort, id');
    return json({
      restaurant: r,
      categories: cats.map((c) => ({ id: c.id, name: c.name, name_ne: c.name_ne, items: items.filter((i) => i.category_id === c.id).map((i) => ({ id: i.id, name: i.name, name_ne: i.name_ne, description: i.description, price_npr: i.price_npr, diet: i.diet, spice: i.spice, available: !!i.available, prep_min: i.prep_min })) })),
    });
  }
  const tm = path.match(/^\/api\/t\/([A-Za-z0-9]{1,6})(\/[a-z-]+)?$/);
  if (tm) {
    const code = L.normalizeTableCode(tm[1]);
    if (!code) fail(404, 'table_not_found');
    const t = await openBillFor(env, code);
    const sub = tm[2] || '';
    if (sub === '' && m === 'GET') {
      const bill = await one<{ id: number; split_mode: string | null; status: string }>(env, "SELECT id, split_mode, status FROM bills WHERE table_id = ? AND status = 'open'", t.id);
      const orders = bill
        ? await all<any>(env, 'SELECT id, number, status, note, created_at FROM orders WHERE bill_id = ? ORDER BY created_at', bill.id)
        : [];
      const oitems = orders.length ? await all<any>(env, `SELECT order_id, name, diet, unit_price, qty, note FROM order_items WHERE order_id IN (${orders.map(() => '?').join(',')}) ORDER BY id`, ...orders.map((o) => o.id)) : [];
      return json({
        table: { code: t.code, label: t.label, seats: t.seats, status: t.status },
        restaurant: await restaurant(env),
        bill: bill ? await billView(env, bill) : null,
        orders: orders.map((o) => ({ number: o.number, status: o.status, created_at: o.created_at, note: o.note, items: oitems.filter((i) => i.order_id === o.id).map((i) => ({ name: i.name, diet: i.diet, unit_price: i.unit_price, qty: i.qty, note: i.note })) })),
        now,
      });
    }
    if (sub === '/orders' && m === 'POST') {
      const b = await body();
      const cart = L.validateCart(b.items);
      if (!cart) fail(422, 'cart_invalid');
      const ids = [...new Set(cart.map((c) => c.item_id))];
      const rows = await all<any>(env, `SELECT id, name, diet, price_npr, available FROM items WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids);
      if (rows.length !== ids.length) fail(422, 'item_not_found');
      for (const r of rows) if (!r.available) fail(409, 'item_unavailable', { item: r.name });
      const byId = new Map(rows.map((r) => [r.id, r]));
      const bill = await billOpenOrCreate(env, t.id, now);
      const before = await billSubtotal(env, bill);
      const existingShares = await one<{ n: number }>(env, 'SELECT COUNT(*) AS n FROM shares WHERE bill_id = ?', bill);
      const num = (await one<{ n: number }>(env, 'SELECT COALESCE(MAX(number),0)+1 AS n FROM orders'))!.n;
      const note = L.cleanNote(b.note);
      const oid = Number((await run(env, 'INSERT INTO orders (number, bill_id, table_id, status, note, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', num, bill, t.id, 'received', note, now, now)).meta.last_row_id);
      for (const c of cart) {
        const it = byId.get(c.item_id)!;
        await run(env, 'INSERT INTO order_items (order_id, item_id, name, diet, unit_price, qty, note) VALUES (?,?,?,?,?,?,?)', oid, it.id, it.name, it.diet, it.price_npr, c.qty, c.note);
      }
      await run(env, "UPDATE tables_ SET status = CASE WHEN status = 'bill_requested' THEN 'bill_requested' ELSE 'occupied' END WHERE id = ?", t.id);
      // An equal split already on the bill: the new food is its own share, so the shares still add up to the bill.
      const after = await billSubtotal(env, bill);
      const r = await restaurant(env);
      if (existingShares && existingShares.n > 0) {
        const delta = L.computeBill(after, r.service_pct, r.tax_pct).total - L.computeBill(before, r.service_pct, r.tax_pct).total;
        if (delta > 0) await run(env, "INSERT INTO shares (bill_id, label, kind, amount, status, created_at) VALUES (?,?,?,?,?,?)", bill, `Added at ${new Date(now + 5.75 * 3600e3).toISOString().slice(11, 16)} (NPT)`, 'extra', delta, 'open', now);
      }
      return json({ ok: true, order: { number: num, status: 'received' }, bill: await billView(env, await billRow(env, bill)) }, 201);
    }
    if (sub === '/call-bill' && m === 'POST') {
      const bill = await one<{ id: number }>(env, "SELECT id FROM bills WHERE table_id = ? AND status = 'open'", t.id);
      if (!bill) fail(409, 'no_open_bill');
      await run(env, "UPDATE tables_ SET status = 'bill_requested' WHERE id = ?", t.id);
      return json({ ok: true, status: 'bill_requested' });
    }
    if (sub === '/split' && m === 'POST') {
      const b = await body();
      if (b.mode !== 'equal' || !Number.isInteger(b.people) || b.people < L.MIN_PEOPLE || b.people > L.MAX_PEOPLE) fail(422, 'split_invalid');
      const bill = await one<{ id: number; split_mode: string | null }>(env, "SELECT id, split_mode FROM bills WHERE table_id = ? AND status = 'open'", t.id);
      if (!bill) fail(409, 'no_open_bill');
      if (bill.split_mode === 'items') fail(409, 'split_mode_locked');
      const existing = await one<{ n: number }>(env, 'SELECT COUNT(*) AS n FROM shares WHERE bill_id = ?', bill.id);
      if (existing && existing.n > 0) fail(409, 'already_split');
      const v = await billView(env, { id: bill.id, split_mode: null, status: 'open' });
      const parts = L.splitEqual(v.totals.total, b.people);
      await run(env, "UPDATE bills SET split_mode = 'equal' WHERE id = ?", bill.id);
      for (let i = 0; i < parts.length; i++) {
        await run(env, "INSERT INTO shares (bill_id, label, kind, amount, status, created_at) VALUES (?,?,?,?,?,?)", bill.id, `Person ${i + 1} of ${parts.length}`, 'equal', parts[i], 'open', now);
      }
      return json({ ok: true, bill: await billView(env, await billRow(env, bill.id)) });
    }
    if (sub === '/claims' && m === 'POST') {
      const b = await body();
      const bill = await one<{ id: number; split_mode: string | null }>(env, "SELECT id, split_mode FROM bills WHERE table_id = ? AND status = 'open'", t.id);
      if (!bill) fail(409, 'no_open_bill');
      if (bill.split_mode === 'equal') fail(409, 'split_mode_locked');
      if (!Array.isArray(b.claims) || b.claims.length < 1 || b.claims.length > 40) fail(422, 'claim_invalid');
      const claim: { item_id: number; qty: number }[] = [];
      for (const c of b.claims) {
        if (!c || !L.isPositiveInt(c.qty, L.MAX_QTY) || !Number.isInteger(c.line_key) || c.line_key < 100000) fail(422, 'claim_invalid');
        claim.push({ item_id: c.line_key, qty: c.qty });
      }
      const lines = await billLines(env, bill.id);
      const lref = lines.map((l) => ({ item_id: l.lkey, ordered: l.ordered, claimed: l.claimed, unit_price: l.unit_price }));
      const problem = L.checkClaim(lref, claim);
      if (problem) fail(409, problem);
      const r = await restaurant(env);
      const sub2 = L.claimSubtotal(lref, claim);
      const v = await billView(env, { id: bill.id, split_mode: bill.split_mode, status: 'open' });
      const after = lref.map((l) => {
        const c = claim.find((x) => x.item_id === l.item_id);
        return { ...l, claimed: l.claimed + (c ? c.qty : 0) };
      });
      const closes = L.fullyClaimed(after);
      const amount = L.shareAmount({ subtotal: sub2, billTotal: v.totals.total, otherSharesTotal: v.covered_npr, closesBill: closes, servicePct: r.service_pct, taxPct: r.tax_pct });
      if (amount <= 0) fail(409, 'claim_empty');
      const label = typeof b.label === 'string' && b.label.trim() ? b.label.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 30) : `Share ${v.shares.length + 1}`;
      const sid = Number((await run(env, "INSERT INTO shares (bill_id, label, kind, amount, status, created_at) VALUES (?,?,?,?,?,?)", bill.id, label, 'items', amount, 'open', now)).meta.last_row_id);
      for (const c of claim) {
        await run(env, 'INSERT INTO share_items (share_id, item_id, qty, unit_price) VALUES (?,?,?,?)', sid, Math.floor(c.item_id / 100000), c.qty, c.item_id % 100000);
      }
      await run(env, "UPDATE bills SET split_mode = 'items' WHERE id = ?", bill.id);
      return json({ ok: true, share_amount: amount, bill: await billView(env, await billRow(env, bill.id)) }, 201);
    }
    return fail(404, 'not_found');
  }

  // --- staff sign-in ---
  if (path === '/api/staff/me' && m === 'GET') {
    // Not signed in is an answer, not an error: a 200 with no staff keeps the browser console clean on guest pages.
    const s = await currentStaff(env, req);
    return json({ staff: s ? { name: s.name, role: s.role } : null });
  }
  if (path === '/api/staff/login' && m === 'POST') {
    const b = await body();
    if (!L.isEmail(b.email) || typeof b.password !== 'string' || b.password.length < 1 || b.password.length > 200) fail(422, 'login_invalid');
    const email = b.email.toLowerCase();
    const since = now - LOGIN_WINDOW_MS;
    const fails = await one<{ n: number }>(env, 'SELECT COUNT(*) AS n FROM login_fail WHERE email = ? AND at > ?', email, since);
    if (Number(fails?.n || 0) >= LOGIN_MAX_FAILS) fail(429, 'too_many_attempts');
    const st = await one<{ id: number; password_hash: string; is_demo: number }>(env, 'SELECT id, password_hash, is_demo FROM staff WHERE email = ?', email);
    const ok = st && !st.is_demo && (await verifyPassword(b.password, st.password_hash));
    if (!ok) {
      await run(env, 'INSERT INTO login_fail (email, at) VALUES (?,?)', email, now);
      fail(401, 'invalid_login');
    }
    await run(env, 'DELETE FROM login_fail WHERE email = ?', email);
    return startSession(env, st!.id);
  }
  if (path === '/api/staff/demo' && m === 'POST') {
    const b = await body();
    if (!L.isStaffRole(b.role)) fail(422, 'role_invalid');
    const st = await one<{ id: number }>(env, 'SELECT id FROM staff WHERE is_demo = 1 AND role = ?', b.role);
    if (!st) fail(404, 'not_found');
    return startSession(env, st.id);
  }
  if (path === '/api/staff/logout' && m === 'POST') {
    const tok = readCookie(req, SESSION_COOKIE);
    if (tok) await run(env, 'DELETE FROM sessions WHERE token_hash = ?', await sha256hex(tok));
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
  }

  // --- kitchen ---
  if (path === '/api/kds/tickets' && m === 'GET') {
    await requireStaff(env, req, 'kitchen');
    const orders = await all<any>(
      env,
      `SELECT o.id, o.number, o.status, o.note, o.created_at, t.code AS table_code, t.label AS table_label
         FROM orders o JOIN tables_ t ON t.id = o.table_id JOIN bills b ON b.id = o.bill_id
         WHERE o.status IN ('received','cooking','ready') AND b.status = 'open' ORDER BY o.created_at`,
    );
    const items = orders.length ? await all<any>(env, `SELECT order_id, name, diet, qty, note FROM order_items WHERE order_id IN (${orders.map(() => '?').join(',')}) ORDER BY id`, ...orders.map((o) => o.id)) : [];
    return json({
      now,
      tickets: orders.map((o) => ({
        id: o.id,
        number: o.number,
        status: o.status,
        note: o.note,
        table: { code: o.table_code, label: o.table_label },
        created_at: o.created_at,
        minutes: L.minutesSince(o.created_at, now),
        items: items.filter((i) => i.order_id === o.id).map((i) => ({ name: i.name, diet: i.diet, qty: i.qty, note: i.note })),
      })),
    });
  }
  const km = path.match(/^\/api\/kds\/orders\/(\d+)\/status$/);
  if (km && m === 'POST') {
    const s = await requireStaff(env, req, 'kitchen');
    const b = await body();
    if (!L.isOrderStatus(b.status)) fail(422, 'status_invalid');
    if (b.status === 'served' && !L.can(s.role, 'floor')) fail(403, 'role_not_allowed');
    const o = await one<{ status: string }>(env, 'SELECT status FROM orders WHERE id = ?', Number(km[1]));
    if (!o) fail(404, 'not_found');
    if (!L.canMove(o.status, b.status)) fail(409, 'bad_transition', { from: o.status });
    await run(env, 'UPDATE orders SET status = ?, updated_at = ? WHERE id = ?', b.status, now, Number(km[1]));
    return json({ ok: true, status: b.status });
  }

  // --- floor ---
  if (path === '/api/floor/tables' && m === 'GET') {
    await requireStaff(env, req, 'floor');
    const tables = await all<any>(env, 'SELECT id, code, label, seats, status FROM tables_ ORDER BY code');
    const out = [];
    for (const t of tables) {
      const bill = await one<{ id: number; split_mode: string | null; status: string }>(env, "SELECT id, split_mode, status FROM bills WHERE table_id = ? AND status = 'open'", t.id);
      const v = bill ? await billView(env, bill) : null;
      const readyCount = bill ? Number((await one<{ n: number }>(env, "SELECT COUNT(*) AS n FROM orders WHERE bill_id = ? AND status IN ('received','cooking','ready')", bill!.id))?.n || 0) : 0;
      out.push({ id: t.id, code: t.code, label: t.label, seats: t.seats, status: t.status, kitchen_open: readyCount, bill: v });
    }
    return json({ tables: out });
  }
  const fm = path.match(/^\/api\/floor\/bills\/(\d+)\/(shares\/(\d+)\/paid|settle)$/);
  if (fm && m === 'POST') {
    const s = await requireStaff(env, req, 'floor');
    const billId = Number(fm[1]);
    const bill = await one<{ id: number; table_id: number; split_mode: string | null; status: string }>(env, 'SELECT id, table_id, split_mode, status FROM bills WHERE id = ?', billId);
    if (!bill || bill.status !== 'open') fail(409, 'bill_not_open');
    if (fm[3]) {
      const sh = await one<{ id: number; status: string; bill_id: number }>(env, 'SELECT id, status, bill_id FROM shares WHERE id = ?', Number(fm[3]));
      if (!sh || sh.bill_id !== billId) fail(404, 'not_found');
      if (sh.status === 'paid') fail(409, 'already_paid');
      await run(env, "UPDATE shares SET status = 'paid', paid_at = ? WHERE id = ?", now, sh.id);
      await audit(env, s.name, 'share_paid', `bill ${billId} share ${sh.id}`);
    } else {
      const v = await billView(env, bill);
      await run(env, "UPDATE shares SET status = 'paid', paid_at = ? WHERE bill_id = ? AND status = 'open'", now, billId);
      if (v.totals.total > v.covered_npr) {
        await run(env, "INSERT INTO shares (bill_id, label, kind, amount, status, created_at, paid_at) VALUES (?,?,?,?,'paid',?,?)", billId, 'Settled at the counter', 'settled', v.totals.total - v.covered_npr, now, now);
      }
      await run(env, "UPDATE bills SET status = 'closed', closed_at = ? WHERE id = ?", now, billId);
      await run(env, "UPDATE tables_ SET status = 'free' WHERE id = ?", bill.table_id);
      await audit(env, s.name, 'bill_settled', `bill ${billId} total ${v.totals.total}`);
      return json({ ok: true, closed: true, total_npr: v.totals.total });
    }
    const v = await billView(env, bill);
    const closed = v.shares.length > 0 && v.shares.every((x) => x.status === 'paid') && v.uncovered_npr === 0;
    if (closed) {
      await run(env, "UPDATE bills SET status = 'closed', closed_at = ? WHERE id = ?", now, billId);
      await run(env, "UPDATE tables_ SET status = 'free' WHERE id = ?", bill.table_id);
    }
    return json({ ok: true, closed, bill: v });
  }

  // --- manager ---
  if (path === '/api/manage/menu' && m === 'GET') {
    await requireStaff(env, req, 'manager');
    const r = await restaurant(env);
    const categories = await all<any>(env, 'SELECT id, name, name_ne, sort FROM categories ORDER BY sort, id');
    const items = await all<any>(env, 'SELECT id, category_id, name, name_ne, description, price_npr, diet, spice, available, prep_min, sort FROM items ORDER BY sort, id');
    const tables = await all<any>(env, 'SELECT id, code, label, seats, status FROM tables_ ORDER BY code');
    const staff = await all<any>(env, 'SELECT id, name, email, role, is_demo FROM staff ORDER BY role, name');
    const audits = await all<any>(env, 'SELECT at, actor, action, detail FROM audit ORDER BY id DESC LIMIT 12');
    return json({ restaurant: r, categories: categories.map((c) => ({ ...c, items: items.filter((i) => i.category_id === c.id).map((i) => ({ ...i, available: !!i.available })) })), tables, staff: staff.map((s) => ({ ...s, is_demo: !!s.is_demo })), audit: audits });
  }
  if (path === '/api/manage/settings' && m === 'PUT') {
    const s = await requireStaff(env, req, 'manager');
    const b = await body();
    if (b.restaurant_name !== undefined) {
      const name = L.cleanNote(b.restaurant_name).slice(0, 60);
      if (!name) fail(422, 'name_invalid');
      await run(env, 'INSERT OR REPLACE INTO settings (k, v) VALUES (?, ?)', 'restaurant_name', name);
    }
    if (b.tax_pct !== undefined) {
      if (!Number.isInteger(b.tax_pct) || b.tax_pct < 0 || b.tax_pct > 30) fail(422, 'tax_invalid');
      await run(env, 'INSERT OR REPLACE INTO settings (k, v) VALUES (?, ?)', 'tax_pct', String(b.tax_pct));
    }
    if (b.service_pct !== undefined) {
      if (!Number.isInteger(b.service_pct) || b.service_pct < 0 || b.service_pct > 20) fail(422, 'service_invalid');
      await run(env, 'INSERT OR REPLACE INTO settings (k, v) VALUES (?, ?)', 'service_pct', String(b.service_pct));
    }
    await audit(env, s.name, 'settings_changed', JSON.stringify({ tax: b.tax_pct, service: b.service_pct }));
    return json({ ok: true, restaurant: await restaurant(env) });
  }
  if (path === '/api/manage/categories' && m === 'POST') {
    const s = await requireStaff(env, req, 'manager');
    const b = await body();
    const name = L.cleanNote(b.name).slice(0, 40);
    if (!name) fail(422, 'name_invalid');
    const sort = Number((await one<{ n: number }>(env, 'SELECT COALESCE(MAX(sort),0)+1 AS n FROM categories'))?.n || 1);
    await run(env, 'INSERT INTO categories (name, name_ne, sort) VALUES (?,?,?)', name, L.cleanNote(b.name_ne).slice(0, 40), sort);
    await audit(env, s.name, 'category_added', name);
    return json({ ok: true }, 201);
  }
  if (path === '/api/manage/items' && m === 'POST') {
    const s = await requireStaff(env, req, 'manager');
    const b = await body();
    const v = itemFields(b, true);
    const sort = Number((await one<{ n: number }>(env, 'SELECT COALESCE(MAX(sort),0)+1 AS n FROM items'))?.n || 1);
    const cat = await one<{ id: number }>(env, 'SELECT id FROM categories WHERE id = ?', Number(b.category_id));
    if (!cat) fail(422, 'category_invalid');
    const id = Number((await run(env, 'INSERT INTO items (category_id, name, name_ne, description, price_npr, diet, spice, available, prep_min, sort) VALUES (?,?,?,?,?,?,?,?,?,?)', cat.id, v.name, v.name_ne, v.description, v.price_npr, v.diet, v.spice, v.available, v.prep_min, sort)).meta.last_row_id);
    await audit(env, s.name, 'item_added', v.name);
    return json({ ok: true, id }, 201);
  }
  const im = path.match(/^\/api\/manage\/items\/(\d+)$/);
  if (im && m === 'PUT') {
    const s = await requireStaff(env, req, 'manager');
    const cur = await one<any>(env, 'SELECT * FROM items WHERE id = ?', Number(im[1]));
    if (!cur) fail(404, 'not_found');
    const b = await body();
    const merged = { ...cur, ...pick(b, ['name', 'name_ne', 'description', 'price_npr', 'diet', 'spice', 'available', 'prep_min']) };
    const v = itemFields(merged, false);
    await run(env, 'UPDATE items SET name=?, name_ne=?, description=?, price_npr=?, diet=?, spice=?, available=?, prep_min=? WHERE id=?', v.name, v.name_ne, v.description, v.price_npr, v.diet, v.spice, v.available, v.prep_min, Number(im[1]));
    await audit(env, s.name, 'item_changed', `${v.name} ${v.price_npr} ${v.available ? 'on' : 'sold out'}`);
    return json({ ok: true });
  }
  if (path === '/api/manage/tables' && m === 'POST') {
    const s = await requireStaff(env, req, 'manager');
    const b = await body();
    const code = L.normalizeTableCode(b.code);
    if (!code) fail(422, 'code_invalid');
    if (!L.isPositiveInt(b.seats, 20)) fail(422, 'seats_invalid');
    const label = L.cleanNote(b.label).slice(0, 40) || code;
    try {
      await run(env, "INSERT INTO tables_ (code, label, seats, status) VALUES (?,?,?,'free')", code, label, b.seats);
    } catch {
      fail(409, 'code_taken');
    }
    await audit(env, s.name, 'table_added', code);
    return json({ ok: true }, 201);
  }
  const stm = path.match(/^\/api\/manage\/staff$/);
  if (stm && m === 'POST') {
    const s = await requireStaff(env, req, 'manager');
    const b = await body();
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
    const name = L.cleanNote(b.name).slice(0, 60);
    if (!L.isEmail(email) || !name || !L.isStaffRole(b.role)) fail(422, 'staff_invalid');
    const pw = temporaryPassword(12);
    try {
      await run(env, 'INSERT INTO staff (email, name, password_hash, role, is_demo, created_at) VALUES (?,?,?,?,0,?)', email, name, await hashPassword(pw), b.role, now);
    } catch {
      fail(409, 'email_taken');
    }
    await audit(env, s.name, 'staff_added', `${b.role} ${email}`);
    return json({ ok: true, temporary_password: pw, note: 'Shown once. Ask them to change nothing here; a password change screen is a known limit of this demo.' }, 201);
  }
  return fail(404, 'not_found');
}

function pick(src: Record<string, any>, keys: string[]) {
  const out: Record<string, any> = {};
  for (const k of keys) if (src[k] !== undefined) out[k] = src[k];
  return out;
}

function itemFields(b: Record<string, any>, creating: boolean) {
  const name = L.cleanNote(b.name).slice(0, 60);
  if (!name) fail(422, 'name_invalid');
  const price = Number(b.price_npr);
  if (!Number.isInteger(price) || price < 0 || price > 100000) fail(422, 'price_invalid');
  if (!L.isDiet(b.diet)) fail(422, 'diet_invalid');
  if (!L.isSpice(b.spice ?? 0)) fail(422, 'spice_invalid');
  const prep = b.prep_min === undefined ? 10 : Number(b.prep_min);
  if (!Number.isInteger(prep) || prep < 1 || prep > 120) fail(422, 'prep_invalid');
  void creating;
  return {
    name,
    name_ne: L.cleanNote(b.name_ne).slice(0, 60),
    description: L.cleanNote(b.description).slice(0, 240),
    price_npr: price,
    diet: b.diet as 'veg' | 'nonveg',
    spice: Number(b.spice ?? 0),
    available: b.available === false || b.available === 0 ? 0 : 1,
    prep_min: prep,
  };
}

// ---------- entry ----------
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        await ensureReady(env);
        return await handleApi(req, env, url);
      } catch (e) {
        if (e instanceof HttpError) return json({ error: e.code, ...e.extra }, e.status);
        console.error('api error', e);
        return json({ error: 'server_error' }, 500);
      }
    }
    // Static assets come from the ASSETS binding; paths without an extension get the app shell.
    const hasExt = /\.[a-zA-Z0-9]+$/.test(url.pathname);
    const target = hasExt ? req : new Request(new URL('/app-shell.html', url), req);
    const res = await env.ASSETS.fetch(target);
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
    if (!hasExt) headers.set('Cache-Control', 'no-cache');
    // The shell answers every path so the client can route; a path that is not a screen gets the not-found page with a real 404.
    const status = !hasExt && !SPA_PATHS.test(url.pathname) ? 404 : res.status;
    return new Response(res.body, { status, headers });
  },
};
