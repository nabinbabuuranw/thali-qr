// Shared rules for Thali QR: used by the Worker (api/src) and by the tests. Money is whole NPR (integers), never floats.

export const DEFAULT_TAX_PCT = 13; // VAT, demo default (edit in Manage > Settings)
export const DEFAULT_SERVICE_PCT = 10; // service charge, demo default
export const MAX_QTY = 20;
export const MAX_LINES = 40;
export const NOTE_MAX = 140;
export const MAX_PEOPLE = 10;
export const MIN_PEOPLE = 2;

export const ORDER_FLOW = ['received', 'cooking', 'ready', 'served'] as const;
export type OrderStatus = (typeof ORDER_FLOW)[number];

export function isOrderStatus(s: unknown): s is OrderStatus {
  return typeof s === 'string' && (ORDER_FLOW as readonly string[]).includes(s);
}

/** The next status a ticket may move to, or null when it is already served. */
export function nextStatus(s: string): OrderStatus | null {
  const i = (ORDER_FLOW as readonly string[]).indexOf(s);
  if (i < 0 || i >= ORDER_FLOW.length - 1) return null;
  return ORDER_FLOW[i + 1];
}

/** A ticket may only move one step forward. */
export function canMove(from: string, to: string): boolean {
  return nextStatus(from) === to;
}

export function normalizeTableCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const c = raw.trim().toUpperCase();
  return /^[A-Z0-9]{1,6}$/.test(c) ? c : null;
}

export function isPositiveInt(n: unknown, max: number): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= max;
}

export function cleanNote(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX);
}

export interface OrderLineIn { item_id: unknown; qty: unknown; note?: unknown }

/** Validates the shape of a cart. Returns the clean lines or null. Prices are never taken from the client. */
export function validateCart(lines: unknown): { item_id: number; qty: number; note: string }[] | null {
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > MAX_LINES) return null;
  const out: { item_id: number; qty: number; note: string }[] = [];
  for (const l of lines as OrderLineIn[]) {
    if (!l || typeof l !== 'object') return null;
    if (!isPositiveInt(l.item_id, 1e9) || !isPositiveInt(l.qty, MAX_QTY)) return null;
    out.push({ item_id: l.item_id, qty: l.qty, note: cleanNote(l.note) });
  }
  return out;
}

export interface Totals { subtotal: number; service: number; tax: number; total: number }

/** Bill totals: service charge on the food, VAT on food plus service. Rounded to whole rupees. */
export function computeBill(subtotal: number, servicePct: number, taxPct: number): Totals {
  const service = Math.round((subtotal * servicePct) / 100);
  const tax = Math.round(((subtotal + service) * taxPct) / 100);
  return { subtotal, service, tax, total: subtotal + service + tax };
}

/** The part of the bill one claimed set of items carries, with the same rules as the whole bill. */
export function shareTotals(subtotal: number, servicePct: number, taxPct: number): Totals {
  return computeBill(subtotal, servicePct, taxPct);
}

/** Equal split: amounts sum exactly to the total; the rupee left over goes to the first share. */
export function splitEqual(total: number, people: number): number[] {
  if (!Number.isInteger(people) || people < MIN_PEOPLE || people > MAX_PEOPLE) throw new Error('people_invalid');
  const base = Math.floor(total / people);
  const rest = total - base * people;
  return Array.from({ length: people }, (_, i) => base + (i === 0 ? rest : 0));
}

export interface LineRef { item_id: number; ordered: number; claimed: number; unit_price: number }

/** Validates a claim against what is ordered and still unclaimed. Returns null when it is fine. */
export function checkClaim(lines: LineRef[], claim: { item_id: number; qty: number }[]): string | null {
  if (!claim.length) return 'claim_empty';
  const byId = new Map(lines.map((l) => [l.item_id, l]));
  const seen = new Set<number>();
  for (const c of claim) {
    if (seen.has(c.item_id)) return 'claim_duplicate_line';
    seen.add(c.item_id);
    const l = byId.get(c.item_id);
    if (!l) return 'claim_unknown_item';
    if (c.qty > l.ordered - l.claimed) return 'claim_exceeds_remaining';
  }
  return null;
}

/** Subtotal of a claim at the recorded unit prices. */
export function claimSubtotal(lines: LineRef[], claim: { item_id: number; qty: number }[]): number {
  const byId = new Map(lines.map((l) => [l.item_id, l]));
  return claim.reduce((s, c) => s + c.qty * (byId.get(c.item_id)?.unit_price ?? 0), 0);
}

/** Minutes between two epoch-ms values, never negative. */
export function minutesSince(from: number, now: number): number {
  return Math.max(0, Math.floor((now - from) / 60000));
}

/** Whether every line is fully claimed (nothing left to split). */
export function fullyClaimed(lines: LineRef[]): boolean {
  return lines.every((l) => l.claimed >= l.ordered);
}

/** Share amount: the proportional part; the last claim that clears the bill takes the remainder so the shares add up exactly. */
export function shareAmount(opts: { subtotal: number; billTotal: number; otherSharesTotal: number; closesBill: boolean; servicePct: number; taxPct: number }): number {
  if (opts.closesBill) return opts.billTotal - opts.otherSharesTotal;
  return shareTotals(opts.subtotal, opts.servicePct, opts.taxPct).total;
}

export const DIETS = ['veg', 'nonveg'] as const;
export const isDiet = (d: unknown): d is 'veg' | 'nonveg' => d === 'veg' || d === 'nonveg';
export const isSpice = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 3;
export const STAFF_ROLES = ['kitchen', 'floor', 'manager'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export const isStaffRole = (r: unknown): r is StaffRole => typeof r === 'string' && (STAFF_ROLES as readonly string[]).includes(r);
/** Who may do what. Kitchen runs tickets; floor settles bills; manager also edits the menu, tables and staff. */
export function can(role: string, need: 'kitchen' | 'floor' | 'manager'): boolean {
  if (need === 'kitchen') return role === 'kitchen' || role === 'floor' || role === 'manager';
  if (need === 'floor') return role === 'floor' || role === 'manager';
  return role === 'manager';
}
export function isEmail(s: unknown): s is string {
  return typeof s === 'string' && s.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}
export function formatNpr(n: number): string {
  return 'NPR ' + Math.round(n).toLocaleString('en-US');
}
