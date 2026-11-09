import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { type Env } from '../src/worker.ts';
import { D1Shim } from './d1shim.ts';

const ASSETS = { fetch: async () => new Response('shell', { status: 200 }) };

function newEnv(): Env {
  return { DB: new D1Shim() as any, ASSETS };
}

type Call = { status: number; body: any; cookie?: string };
async function call(env: Env, method: string, path: string, body?: unknown, cookie?: string): Promise<Call> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers['Cookie'] = cookie;
  const res = await worker.fetch(new Request('http://thali.test' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env);
  const sc = res.headers.get('Set-Cookie');
  const text = await res.text();
  let parsed: any = {};
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }
  return { status: res.status, body: parsed, cookie: sc ? sc.split(';')[0] : undefined };
}

async function menuIds(env: Env) {
  const m = await call(env, 'GET', '/api/menu');
  const all = m.body.categories.flatMap((c: any) => c.items);
  return { all, byName: (n: string) => all.find((i: any) => i.name === n) };
}

async function floorSession(env: Env) {
  const r = await call(env, 'POST', '/api/staff/demo', { role: 'floor' });
  assert.equal(r.status, 200);
  return r.cookie!;
}
async function kitchenSession(env: Env) {
  return (await call(env, 'POST', '/api/staff/demo', { role: 'kitchen' })).cookie!;
}
async function managerSession(env: Env) {
  return (await call(env, 'POST', '/api/staff/demo', { role: 'manager' })).cookie!;
}

test('menu is public, grouped, and shows sold-out items as unavailable', async () => {
  const env = newEnv();
  const m = await call(env, 'GET', '/api/menu');
  assert.equal(m.status, 200);
  assert.equal(m.body.categories.length, 6);
  const items = m.body.categories.flatMap((c: any) => c.items);
  assert.equal(items.length, 20);
  assert.equal(m.body.restaurant.demo, true);
  assert.equal(items.find((i: any) => i.name === 'Chicken sekuwa').available, false);
  assert.equal(items.find((i: any) => i.name === 'Veg dal bhat thali').price_npr, 260);
});

test('a seeded table shows its open bill, orders and kitchen state', async () => {
  const env = newEnv();
  const t = await call(env, 'GET', '/api/t/t3');
  assert.equal(t.status, 200);
  assert.equal(t.body.table.code, 'T3');
  assert.equal(t.body.table.status, 'occupied');
  assert.equal(t.body.orders.length, 2);
  assert.ok(t.body.bill.totals.total > 0);
  assert.equal(t.body.bill.totals.total, t.body.bill.totals.subtotal + t.body.bill.totals.service + t.body.bill.totals.tax);
});

test('unknown table and bad table code are 404', async () => {
  const env = newEnv();
  assert.equal((await call(env, 'GET', '/api/t/NOPE')).status, 404);
  assert.equal((await call(env, 'GET', '/api/t/../x')).status, 404);
});

test('orders need JSON, valid items, and available items only; the server sets prices', async () => {
  const env = newEnv();
  const { byName } = await menuIds(env);
  const dal = byName('Veg dal bhat thali');
  const sold = byName('Chicken sekuwa');
  const raw = await worker.fetch(new Request('http://thali.test/api/t/T1/orders', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' }), env);
  assert.equal(raw.status, 415);
  assert.equal((await call(env, 'POST', '/api/t/T1/orders', { items: [{ item_id: dal.id, qty: 0 }] })).status, 422);
  assert.equal((await call(env, 'POST', '/api/t/T1/orders', { items: [{ item_id: 99999, qty: 1 }] })).status, 422);
  const soldRes = await call(env, 'POST', '/api/t/T1/orders', { items: [{ item_id: sold.id, qty: 1 }] });
  assert.equal(soldRes.status, 409);
  assert.equal(soldRes.body.error, 'item_unavailable');
  // A client-sent price is ignored: the server uses the menu price.
  const ok = await call(env, 'POST', '/api/t/T1/orders', { items: [{ item_id: dal.id, qty: 2, note: 'less spicy', price_npr: 1 }] });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.bill.totals.subtotal, 520);
  assert.equal(ok.body.bill.lines[0].unit_price, 260);
  const t = await call(env, 'GET', '/api/t/T1');
  assert.equal(t.body.table.status, 'occupied');
  assert.equal(t.body.orders[0].items[0].note, 'less spicy');
});

test('kitchen moves a ticket one step at a time; only floor or manager may serve', async () => {
  const env = newEnv();
  const { byName } = await menuIds(env);
  await call(env, 'POST', '/api/t/T1/orders', { items: [{ item_id: byName('Plain roti').id, qty: 1 }] });
  const k = await kitchenSession(env);
  const tickets = await call(env, 'GET', '/api/kds/tickets', undefined, k);
  assert.equal(tickets.status, 200);
  const ticket = tickets.body.tickets.find((t: any) => t.table.code === 'T1');
  assert.equal(ticket.status, 'received');
  assert.equal((await call(env, 'POST', `/api/kds/orders/${ticket.id}/status`, { status: 'ready' }, k)).status, 409);
  assert.equal((await call(env, 'POST', `/api/kds/orders/${ticket.id}/status`, { status: 'cooking' }, k)).status, 200);
  assert.equal((await call(env, 'POST', `/api/kds/orders/${ticket.id}/status`, { status: 'ready' }, k)).status, 200);
  assert.equal((await call(env, 'POST', `/api/kds/orders/${ticket.id}/status`, { status: 'served' }, k)).status, 403);
  const f = await floorSession(env);
  assert.equal((await call(env, 'POST', `/api/kds/orders/${ticket.id}/status`, { status: 'served' }, f)).status, 200);
});

test('staff screens need a session; kitchen cannot open the floor screen', async () => {
  const env = newEnv();
  assert.equal((await call(env, 'GET', '/api/staff/me')).body.staff, null);
  assert.equal((await call(env, 'GET', '/api/kds/tickets')).status, 401);
  const k = await kitchenSession(env);
  assert.equal((await call(env, 'GET', '/api/floor/tables', undefined, k)).status, 403);
  assert.equal((await call(env, 'GET', '/api/manage/menu', undefined, k)).status, 403);
});

test('login: wrong password is refused; demo staff have no password route; too many fails lock', async () => {
  const env = newEnv();
  await call(env, 'POST', '/api/staff/login', { email: 'kitchen.demo@thali.invalid', password: 'anything' }).then((r) => assert.equal(r.status, 401));
  for (let i = 0; i < 8; i++) await call(env, 'POST', '/api/staff/login', { email: 'nobody@thali.invalid', password: 'x' });
  assert.equal((await call(env, 'POST', '/api/staff/login', { email: 'nobody@thali.invalid', password: 'x' })).status, 429);
});

test('bill by claims: claimed quantities are capped, the last claim takes the rounding, one tap closes the table', async () => {
  const env = newEnv();
  const { byName } = await menuIds(env);
  await call(env, 'POST', '/api/t/T2/orders', { items: [{ item_id: byName('Veg dal bhat thali').id, qty: 2 }, { item_id: byName('Masala chiya').id, qty: 1 }] });
  const t = await call(env, 'GET', '/api/t/T2');
  const lines = t.body.bill.lines;
  const dal = lines.find((l: any) => l.name === 'Veg dal bhat thali');
  const chiya = lines.find((l: any) => l.name === 'Masala chiya');
  assert.equal((await call(env, 'POST', '/api/t/T2/claims', { claims: [{ line_key: dal.line_key, qty: 3 }] })).status, 409);
  const first = await call(env, 'POST', '/api/t/T2/claims', { claims: [{ line_key: dal.line_key, qty: 1 }], label: 'Me' });
  assert.equal(first.status, 201);
  assert.equal(first.body.bill.split_mode, 'items');
  assert.equal(first.body.bill.shares[0].label, 'Me');
  const rest = await call(env, 'POST', '/api/t/T2/claims', { claims: [{ line_key: dal.line_key, qty: 1 }, { line_key: chiya.line_key, qty: 1 }], label: 'Rest' });
  assert.equal(rest.status, 201);
  const bill = rest.body.bill;
  assert.equal(bill.uncovered_npr, 0);
  assert.equal(bill.covered_npr, bill.totals.total);
  const sum = bill.shares.reduce((s: number, x: any) => s + x.amount, 0);
  assert.equal(sum, bill.totals.total);
  const f = await floorSession(env);
  const tables = await call(env, 'GET', '/api/floor/tables', undefined, f);
  const t2 = tables.body.tables.find((x: any) => x.code === 'T2');
  assert.equal(t2.bill.shares.length, 2);
  const closeOne = await call(env, 'POST', `/api/floor/bills/${bill.bill_id}/shares/${bill.shares[0].id}/paid`, {}, f);
  assert.equal(closeOne.body.closed, false);
  const closeTwo = await call(env, 'POST', `/api/floor/bills/${bill.bill_id}/shares/${bill.shares[1].id}/paid`, {}, f);
  assert.equal(closeTwo.body.closed, true);
  const after = await call(env, 'GET', '/api/t/T2');
  assert.equal(after.body.bill, null);
  assert.equal(after.body.table.status, 'free');
});

test('equal split: N shares add up exactly; claims are refused; a later order becomes its own share', async () => {
  const env = newEnv();
  const { byName } = await menuIds(env);
  await call(env, 'POST', '/api/t/T4/orders', { items: [{ item_id: byName('Kheer').id, qty: 1 }, { item_id: byName('Kukhura ko masu').id, qty: 1 }] });
  const s = await call(env, 'POST', '/api/t/T4/split', { mode: 'equal', people: 3 });
  assert.equal(s.status, 200);
  const total = s.body.bill.totals.total;
  assert.equal(s.body.bill.shares.length, 3);
  assert.equal(s.body.bill.shares.reduce((a: number, x: any) => a + x.amount, 0), total);
  assert.equal((await call(env, 'POST', '/api/t/T4/split', { mode: 'equal', people: 2 })).status, 409);
  assert.equal((await call(env, 'POST', '/api/t/T4/claims', { claims: [{ line_key: s.body.bill.lines[0].line_key, qty: 1 }] })).status, 409);
  const more = await call(env, 'POST', '/api/t/T4/orders', { items: [{ item_id: byName('Plain roti').id, qty: 2 }] });
  assert.equal(more.status, 201);
  const b = more.body.bill;
  assert.equal(b.shares.length, 4);
  assert.equal(b.covered_npr, b.totals.total);
});

test('settle the whole bill at the counter closes it and frees the table', async () => {
  const env = newEnv();
  const f = await floorSession(env);
  const t5 = await call(env, 'GET', '/api/t/T5');
  assert.equal(t5.body.table.status, 'bill_requested');
  const billId = t5.body.bill.bill_id;
  const paid = await call(env, 'POST', `/api/floor/bills/${billId}/shares/${t5.body.bill.shares[1].id}/paid`, {}, f);
  assert.equal(paid.status, 200);
  const settle = await call(env, 'POST', `/api/floor/bills/${billId}/settle`, {}, f);
  assert.equal(settle.status, 200);
  assert.equal(settle.body.closed, true);
  assert.equal((await call(env, 'GET', '/api/t/T5')).body.table.status, 'free');
});

test('manager edits menu price and availability, and the customer menu follows', async () => {
  const env = newEnv();
  const m = await managerSession(env);
  const menu = await call(env, 'GET', '/api/manage/menu', undefined, m);
  const sekuwa = menu.body.categories.flatMap((c: any) => c.items).find((i: any) => i.name === 'Chicken sekuwa');
  assert.equal((await call(env, 'PUT', `/api/manage/items/${sekuwa.id}`, { available: true, price_npr: 360 }, m)).status, 200);
  const pub = await call(env, 'GET', '/api/menu');
  const item = pub.body.categories.flatMap((c: any) => c.items).find((i: any) => i.id === sekuwa.id);
  assert.equal(item.available, true);
  assert.equal(item.price_npr, 360);
  const bad = await call(env, 'PUT', `/api/manage/items/${sekuwa.id}`, { price_npr: -5 }, m);
  assert.equal(bad.status, 422);
  assert.equal((await call(env, 'POST', '/api/manage/tables', { code: 'T1', seats: 2 }, m)).status, 409);
  const staff = await call(env, 'POST', '/api/manage/staff', { name: 'Test Floor', email: 'floor@example.test', role: 'floor' }, m);
  assert.equal(staff.status, 201);
  assert.ok(staff.body.temporary_password.length >= 10);
  const login = await call(env, 'POST', '/api/staff/login', { email: 'floor@example.test', password: staff.body.temporary_password });
  assert.equal(login.status, 200);
});

test('the shell answers known screens with 200 and any other path with a real 404', async () => {
  const env = newEnv();
  for (const p of ['/', '/login', '/kitchen', '/floor', '/manage', '/terms', '/privacy', '/t/T4']) {
    const r = await worker.fetch(new Request('http://thali.test' + p), env);
    assert.equal(r.status, 200, p);
  }
  for (const p of ['/nope', '/t/TOOLONGCODE', '/admin/secret']) {
    const r = await worker.fetch(new Request('http://thali.test' + p), env);
    assert.equal(r.status, 404, p);
    assert.match(await r.text(), /shell/);
  }
});
