import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../../shared/logic.ts';

test('bill totals: service on food, VAT on food plus service, whole rupees', () => {
  const t = L.computeBill(1000, 10, 13);
  assert.deepEqual(t, { subtotal: 1000, service: 100, tax: 143, total: 1243 });
  assert.deepEqual(L.computeBill(0, 10, 13), { subtotal: 0, service: 0, tax: 0, total: 0 });
  assert.deepEqual(L.computeBill(333, 0, 0), { subtotal: 333, service: 0, tax: 0, total: 333 });
});

test('equal split adds up exactly; the spare rupee goes to the first share', () => {
  const parts = L.splitEqual(1000, 3);
  assert.deepEqual(parts, [334, 333, 333]);
  assert.equal(parts.reduce((a, b) => a + b, 0), 1000);
  for (let n = 2; n <= 10; n++) {
    for (const total of [0, 1, 999, 1243, 45678]) {
      const p = L.splitEqual(total, n);
      assert.equal(p.length, n);
      assert.equal(p.reduce((a, b) => a + b, 0), total);
    }
  }
});

test('equal split refuses 1 person and 11 people', () => {
  assert.throws(() => L.splitEqual(100, 1));
  assert.throws(() => L.splitEqual(100, 11));
  assert.throws(() => L.splitEqual(100, 2.5));
});

test('order flow moves one step forward and stops at served', () => {
  assert.equal(L.nextStatus('received'), 'cooking');
  assert.equal(L.nextStatus('cooking'), 'ready');
  assert.equal(L.nextStatus('ready'), 'served');
  assert.equal(L.nextStatus('served'), null);
  assert.equal(L.nextStatus('bogus'), null);
  assert.equal(L.canMove('received', 'ready'), false);
  assert.equal(L.canMove('ready', 'served'), true);
  assert.equal(L.isOrderStatus('cooking'), true);
  assert.equal(L.isOrderStatus('paid'), false);
});

test('cart validation: positive integer ids and quantities, notes cleaned and capped', () => {
  assert.equal(L.validateCart([]), null);
  assert.equal(L.validateCart([{ item_id: 1, qty: 0 }]), null);
  assert.equal(L.validateCart([{ item_id: 1, qty: 21 }]), null);
  assert.equal(L.validateCart([{ item_id: 1.5, qty: 1 }]), null);
  assert.equal(L.validateCart([{ item_id: '1', qty: 1 }]), null);
  const ok = L.validateCart([{ item_id: 3, qty: 2, note: '  less\u0000 spicy\n please ' }]);
  assert.deepEqual(ok, [{ item_id: 3, qty: 2, note: 'less spicy please' }]);
  const long = L.validateCart([{ item_id: 3, qty: 1, note: 'x'.repeat(500) }]);
  assert.equal(long![0].note.length, L.NOTE_MAX);
});

test('table codes are short uppercase alphanumerics', () => {
  assert.equal(L.normalizeTableCode(' t4 '), 'T4');
  assert.equal(L.normalizeTableCode('../etc'), null);
  assert.equal(L.normalizeTableCode('TOOLONGCODE'), null);
  assert.equal(L.normalizeTableCode(7), null);
});

const lines: L.LineRef[] = [
  { item_id: 1, ordered: 2, claimed: 0, unit_price: 250 },
  { item_id: 2, ordered: 1, claimed: 1, unit_price: 320 },
];

test('claims: cannot exceed what is ordered and unclaimed; duplicates and unknown items refused', () => {
  assert.equal(L.checkClaim(lines, [{ item_id: 1, qty: 2 }]), null);
  assert.equal(L.checkClaim(lines, [{ item_id: 1, qty: 3 }]), 'claim_exceeds_remaining');
  assert.equal(L.checkClaim(lines, [{ item_id: 2, qty: 1 }]), 'claim_exceeds_remaining');
  assert.equal(L.checkClaim(lines, [{ item_id: 1, qty: 1 }, { item_id: 1, qty: 1 }]), 'claim_duplicate_line');
  assert.equal(L.checkClaim(lines, [{ item_id: 9, qty: 1 }]), 'claim_unknown_item');
  assert.equal(L.checkClaim(lines, []), 'claim_empty');
});

test('claim subtotal uses the recorded unit prices', () => {
  assert.equal(L.claimSubtotal(lines, [{ item_id: 1, qty: 2 }, { item_id: 2, qty: 0 }]), 500);
});

test('the last claim that clears the bill takes the rounding remainder', () => {
  const total = L.computeBill(1000, 10, 13).total; // 1243
  const first = L.shareAmount({ subtotal: 400, billTotal: total, otherSharesTotal: 0, closesBill: false, servicePct: 10, taxPct: 13 });
  const last = L.shareAmount({ subtotal: 600, billTotal: total, otherSharesTotal: first, closesBill: true, servicePct: 10, taxPct: 13 });
  assert.equal(first + last, total);
});

test('fully claimed detection and minutes never negative', () => {
  assert.equal(L.fullyClaimed(lines), false);
  assert.equal(L.fullyClaimed([{ item_id: 1, ordered: 2, claimed: 2, unit_price: 1 }]), true);
  assert.equal(L.minutesSince(10 * 60000, 5 * 60000), 0);
  assert.equal(L.minutesSince(0, 7 * 60000 + 30000), 7);
});

test('roles: kitchen sees tickets, floor settles, only manager edits', () => {
  assert.equal(L.can('kitchen', 'kitchen'), true);
  assert.equal(L.can('kitchen', 'floor'), false);
  assert.equal(L.can('floor', 'floor'), true);
  assert.equal(L.can('floor', 'manager'), false);
  assert.equal(L.can('manager', 'manager'), true);
  assert.equal(L.isStaffRole('admin'), false);
});
