// A D1-shaped stand-in over node:sqlite, used by the unit and API tests only.
import { DatabaseSync } from 'node:sqlite';

class Stmt {
  db: any;
  sql: string;
  args: unknown[];
  constructor(db: any, sql: string, args: unknown[] = []) {
    this.db = db;
    this.sql = sql;
    this.args = args;
  }
  bind(...a: unknown[]) {
    return new Stmt(this.db, this.sql, a);
  }
  isRead() {
    return /^\s*(SELECT|WITH)/i.test(this.sql);
  }
  async first(col?: string) {
    const r = this.db.prepare(this.sql).get(...this.args);
    if (!r) return null;
    return col ? (r as any)[col] : { ...r };
  }
  async all() {
    return { results: this.db.prepare(this.sql).all(...this.args).map((r: any) => ({ ...r })), success: true };
  }
  async run() {
    const r = this.db.prepare(this.sql).run(...this.args);
    return { success: true, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
}

export class D1Shim {
  db: any;
  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.db.exec('PRAGMA foreign_keys = ON');
  }
  prepare(sql: string) {
    return new Stmt(this.db, sql);
  }
  async batch(stmts: Stmt[]) {
    this.db.exec('BEGIN');
    try {
      const out = [];
      for (const s of stmts) out.push(s.isRead() ? await s.all() : await s.run());
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
}
