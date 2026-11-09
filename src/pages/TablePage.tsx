import { useMemo, useState, useEffect } from 'react';
import { Header } from '../components/Shell';
import { DietMark, SpiceDots } from '../components/Mark';
import { Banner, Skeleton } from '../components/ui';
import { get, post, messageFor } from '../lib/api';
import { npr, STATUS_LABEL } from '../lib/format';
import { usePoll } from '../lib/poll';

interface MenuItem { id: number; name: string; name_ne: string; description: string; price_npr: number; diet: 'veg' | 'nonveg'; spice: number; available: boolean; prep_min: number }
interface Category { id: number; name: string; name_ne: string; items: MenuItem[] }
interface Menu { restaurant: { name: string; tax_pct: number; service_pct: number }; categories: Category[] }
interface BillLine { line_key: number; name: string; diet: string; unit_price: number; ordered: number; claimed: number; remaining: number }
interface Share { id: number; label: string; kind: string; amount: number; status: string; items: { name: string; qty: number }[] }
interface Bill {
  bill_id: number; status: string; split_mode: 'equal' | 'items' | null; lines: BillLine[];
  totals: { subtotal: number; service: number; tax: number; total: number };
  shares: Share[]; covered_npr: number; paid_npr: number; uncovered_npr: number; due_npr: number;
}
interface TableState {
  table: { code: string; label: string; seats: number; status: string };
  restaurant: { name: string; tax_pct: number; service_pct: number };
  bill: Bill | null;
  orders: { number: number; status: string; created_at: number; note: string; items: { name: string; diet: string; unit_price: number; qty: number; note: string }[] }[];
  now: number;
}

type Cart = Record<number, { qty: number; note: string }>;
type Sort = 'menu' | 'low' | 'high';

export function TablePage({ code }: { code: string }) {
  const tcode = code.toUpperCase();
  const cartKey = `thali-cart-${tcode}`;
  const [view, setView] = useState<'menu' | 'bill'>('menu');
  const [menu, setMenu] = useState<Menu | null>(null);
  const [menuErr, setMenuErr] = useState<string | null>(null);
  const [cart, setCart] = useState<Cart>(() => {
    try {
      return JSON.parse(localStorage.getItem(cartKey) || '{}');
    } catch {
      return {};
    }
  });
  const [q, setQ] = useState('');
  const [diet, setDiet] = useState<'all' | 'veg' | 'nonveg'>('all');
  const [sort, setSort] = useState<Sort>('menu');
  const [reviewing, setReviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [placed, setPlaced] = useState<number | null>(null);
  const table = usePoll<TableState>(() => get<TableState>(`/api/t/${tcode}`), view === 'bill' ? 6000 : 15000, [tcode, view]);

  useEffect(() => {
    get<Menu>('/api/menu').then(setMenu).catch((e) => setMenuErr(messageFor(e)));
  }, []);
  useEffect(() => {
    localStorage.setItem(cartKey, JSON.stringify(cart));
  }, [cart, cartKey]);

  const itemById = useMemo(() => {
    const m = new Map<number, MenuItem>();
    menu?.categories.forEach((c) => c.items.forEach((i) => m.set(i.id, i)));
    return m;
  }, [menu]);

  const lines = Object.entries(cart).filter(([, v]) => v.qty > 0).map(([id, v]) => ({ item: itemById.get(Number(id))!, ...v })).filter((l) => l.item);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const estimate = lines.reduce((s, l) => s + l.qty * l.item.price_npr, 0);
  const pct = menu?.restaurant || table.data?.restaurant;
  const soldOutInCart = lines.filter((l) => !l.item.available);

  const setQty = (id: number, qty: number) => {
    setCart((c) => {
      const next = { ...c };
      const q2 = Math.max(0, Math.min(20, qty));
      if (q2 === 0) delete next[id];
      else next[id] = { qty: q2, note: next[id]?.note || '' };
      return next;
    });
  };
  const setNote = (id: number, note: string) => setCart((c) => ({ ...c, [id]: { qty: c[id]?.qty || 1, note: note.slice(0, 140) } }));

  const visible = (cat: Category) =>
    cat.items
      .filter((i) => (diet === 'all' ? true : i.diet === diet))
      .filter((i) => !q.trim() || (i.name + ' ' + i.name_ne + ' ' + i.description).toLowerCase().includes(q.trim().toLowerCase()))
      .sort((a, b) => (sort === 'low' ? a.price_npr - b.price_npr : sort === 'high' ? b.price_npr - a.price_npr : 0));

  const place = async () => {
    setSending(true);
    setNotice(null);
    try {
      const body = { items: lines.map((l) => ({ item_id: l.item.id, qty: l.qty, note: l.note })) };
      const r = await post<{ order: { number: number } }>(`/api/t/${tcode}/orders`, body);
      setCart({});
      setReviewing(false);
      setPlaced(r.order.number);
      setView('bill');
      void table.reload();
    } catch (e) {
      setNotice({ kind: 'error', text: messageFor(e) });
      void menuReload();
    } finally {
      setSending(false);
    }
  };
  const menuReload = async () => {
    try {
      setMenu(await get<Menu>('/api/menu'));
    } catch {
      /* keep the old menu */
    }
  };

  const callBill = async () => {
    try {
      await post(`/api/t/${tcode}/call-bill`);
      setNotice({ kind: 'ok', text: 'The staff are coming to your table with the bill.' });
      void table.reload();
    } catch (e) {
      setNotice({ kind: 'error', text: messageFor(e) });
    }
  };

  return (
    <>
      <Header />
      <main className="table-page">
        <div className="table-head">
          <div className="table-id" aria-hidden="true"><span>Table</span><b>{tcode}</b></div>
          <div>
            <h1 className="table-title">{pct?.name || 'Sanjha Chulo (DEMO restaurant)'}</h1>
            <p className="muted small">{table.data ? `${table.data.table.label} · seats ${table.data.table.seats}` : 'Loading your table…'}</p>
          </div>
        </div>

        <div className="seg" role="tablist" aria-label="Menu or bill">
          <button role="tab" aria-selected={view === 'menu'} className={view === 'menu' ? 'on' : ''} onClick={() => setView('menu')}>Menu</button>
          <button role="tab" aria-selected={view === 'bill'} className={view === 'bill' ? 'on' : ''} onClick={() => setView('bill')}>
            Your order and bill{table.data?.orders.length ? ` (${table.data.orders.length})` : ''}
          </button>
        </div>

        {notice ? <Banner kind={notice.kind === 'ok' ? 'ok' : notice.kind === 'error' ? 'error' : 'info'}>{notice.text}</Banner> : null}
        {placed ? (
          <Banner kind="ok">Order #{placed} is with the kitchen. Watch its progress under “Your order and bill”.</Banner>
        ) : null}

        {view === 'menu' ? (
          <section aria-label="Menu">
            {menuErr ? <Banner kind="error">{menuErr}</Banner> : null}
            {!menu && !menuErr ? <Skeleton rows={6} /> : null}
            {menu ? (
              <>
                <div className="menu-tools">
                  <label className="search">
                    <span className="sr">Search dishes</span>
                    <input type="search" placeholder="Search dishes" value={q} onChange={(e) => setQ(e.target.value)} maxLength={60} />
                  </label>
                  <div className="filters">
                    <div className="seg seg-small" role="group" aria-label="Veg or non-veg">
                      {(['all', 'veg', 'nonveg'] as const).map((d) => (
                        <button key={d} className={diet === d ? 'on' : ''} aria-pressed={diet === d} onClick={() => setDiet(d)}>
                          {d === 'all' ? 'All' : d === 'veg' ? 'Veg' : 'Non-veg'}
                        </button>
                      ))}
                    </div>
                    <label className="select">
                      <span className="sr">Sort</span>
                      <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                        <option value="menu">Menu order</option>
                        <option value="low">Price, low to high</option>
                        <option value="high">Price, high to low</option>
                      </select>
                    </label>
                  </div>
                </div>
                <nav className="cat-jump" aria-label="Jump to category">
                  {menu.categories.map((c) => (
                    <a key={c.id} href={`#cat-${c.id}`}>{c.name}</a>
                  ))}
                </nav>
                {menu.categories.map((cat) => {
                  const items = visible(cat);
                  if (!items.length) return null;
                  return (
                    <section key={cat.id} id={`cat-${cat.id}`} className="cat" aria-labelledby={`h-${cat.id}`}>
                      <h2 id={`h-${cat.id}`}>{cat.name} <span className="ne">{cat.name_ne}</span></h2>
                      <ul className="dishes">
                        {items.map((it) => {
                          const qty = cart[it.id]?.qty || 0;
                          return (
                            <li key={it.id} className={it.available ? '' : 'sold'}>
                              <div className="dish-main">
                                <div className="dish-name">
                                  <DietMark diet={it.diet} />
                                  <span>{it.name}</span>
                                  <span className="ne">{it.name_ne}</span>
                                </div>
                                <p className="dish-desc">{it.description}</p>
                                <div className="dish-meta">
                                  <SpiceDots level={it.spice} />
                                  <span>{it.prep_min} min</span>
                                  {!it.available ? <span className="sold-tag">Sold out today</span> : null}
                                </div>
                              </div>
                              <div className="dish-buy">
                                <span className="price">{npr(it.price_npr)}</span>
                                {it.available ? (
                                  <div className="stepper" role="group" aria-label={`Quantity of ${it.name}`}>
                                    <button onClick={() => setQty(it.id, qty - 1)} disabled={qty === 0} aria-label={`Take one ${it.name} off`}>−</button>
                                    <output aria-live="polite">{qty}</output>
                                    <button onClick={() => setQty(it.id, qty + 1)} disabled={qty >= 20} aria-label={`Add one ${it.name}`}>+</button>
                                  </div>
                                ) : (
                                  <span className="muted small">Not today</span>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  );
                })}
                <p className="muted small fine">Prices include service and VAT on the bill, as shown on the bill tab. The price on each dish is the menu price.</p>
              </>
            ) : null}
          </section>
        ) : (
          <section aria-label="Your order and bill" className="bill-view">
            {!table.data && !table.error ? <Skeleton rows={4} /> : null}
            {table.error && !table.data ? <Banner kind="error">{messageFor(table.error)}</Banner> : null}
            {table.data ? (
              <>
                <h2>Orders at this table</h2>
                {table.data.orders.length === 0 ? (
                  <p className="muted">Nothing ordered yet. Pick dishes from the menu and place your order.</p>
                ) : (
                  <ol className="orders">
                    {table.data.orders.map((o) => (
                      <li key={o.number} className={`order st-${o.status}`}>
                        <div className="order-head">
                          <b>Order #{o.number}</b>
                          <span className="chip">{STATUS_LABEL[o.status] || o.status}</span>
                        </div>
                        <ul className="progress" aria-label={`Status of order ${o.number}`}>
                          {['received', 'cooking', 'ready', 'served'].map((s) => (
                            <li key={s} className={['received', 'cooking', 'ready', 'served'].indexOf(s) <= ['received', 'cooking', 'ready', 'served'].indexOf(o.status) ? 'done' : ''}>{STATUS_LABEL[s]}</li>
                          ))}
                        </ul>
                        <ul className="order-lines">
                          {o.items.map((i, idx) => (
                            <li key={idx}>
                              <span>{i.qty} × {i.name}</span>
                              <span>{npr(i.qty * i.unit_price)}</span>
                              {i.note ? <em className="note">{i.note}</em> : null}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ol>
                )}

                {table.data.bill ? (
                  <BillBlock tcode={tcode} bill={table.data.bill} reload={table.reload} setNotice={setNotice} />
                ) : null}

                <div className="cta-row">
                  {table.data.bill && table.data.table.status !== 'bill_requested' ? (
                    <button className="btn btn-ghost" onClick={callBill}>Call the staff for the bill</button>
                  ) : null}
                  {table.data.table.status === 'bill_requested' ? <span className="chip chip-warn">The bill is on its way</span> : null}
                </div>
              </>
            ) : null}
          </section>
        )}
      </main>

      {view === 'menu' && count > 0 && !reviewing ? (
        <div className="cart-bar" role="region" aria-label="Your order">
          <div>
            <b>{count} {count === 1 ? 'dish' : 'dishes'}</b>
            <span className="muted small"> · about {npr(estimate)} before service and VAT</span>
          </div>
          <button className="btn btn-primary" onClick={() => setReviewing(true)}>Review order</button>
        </div>
      ) : null}

      {reviewing ? (
        <div className="sheet-wrap" role="dialog" aria-modal="true" aria-labelledby="review-h">
          <div className="sheet">
            <div className="sheet-head">
              <h2 id="review-h">Review your order</h2>
              <button className="btn btn-quiet" onClick={() => setReviewing(false)}>Close</button>
            </div>
            <ul className="review">
              {lines.map((l) => (
                <li key={l.item.id} className={l.item.available ? '' : 'sold'}>
                  <div className="review-row">
                    <span className="review-name">{l.item.name}</span>
                    <div className="stepper" role="group" aria-label={`Quantity of ${l.item.name}`}>
                      <button onClick={() => setQty(l.item.id, l.qty - 1)} aria-label={`Take one ${l.item.name} off`}>−</button>
                      <output aria-live="polite">{l.qty}</output>
                      <button onClick={() => setQty(l.item.id, l.qty + 1)} aria-label={`Add one ${l.item.name}`}>+</button>
                    </div>
                    <span className="price">{npr(l.qty * l.item.price_npr)}</span>
                  </div>
                  <label className="field note-field">
                    <span className="sr">Note for the kitchen for {l.item.name}</span>
                    <input value={l.note} maxLength={140} placeholder="Note for the kitchen, e.g. less spicy" onChange={(e) => setNote(l.item.id, e.target.value)} />
                  </label>
                  {!l.item.available ? <p className="sold-tag">Sold out now. Remove it to send the order.</p> : null}
                </li>
              ))}
            </ul>
            <p className="muted small">The kitchen gets the menu price from the restaurant. Final totals with service and VAT appear on your bill.</p>
            <button className="btn btn-primary wide" onClick={place} disabled={sending || soldOutInCart.length > 0 || lines.length === 0}>
              {sending ? 'Sending to the kitchen…' : `Send ${count} ${count === 1 ? 'dish' : 'dishes'} to the kitchen`}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function BillBlock({ tcode, bill, reload, setNotice }: { tcode: string; bill: Bill; reload: () => Promise<void>; setNotice: (n: { kind: 'ok' | 'error' | 'info'; text: string } | null) => void }) {
  const [people, setPeople] = useState(2);
  const [claims, setClaims] = useState<Record<number, number>>({});
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = bill.split_mode === 'equal';
  const claimable = bill.lines.filter((l) => l.remaining > 0);

  const splitEqual = async () => {
    setBusy(true);
    try {
      await post(`/api/t/${tcode}/split`, { mode: 'equal', people });
      setNotice({ kind: 'ok', text: `Split between ${people} people. Each share is shown below.` });
      await reload();
    } catch (e) {
      setNotice({ kind: 'error', text: messageFor(e) });
    } finally {
      setBusy(false);
    }
  };

  const claimShare = async () => {
    const list = Object.entries(claims).filter(([, q]) => q > 0).map(([k, q]) => ({ line_key: Number(k), qty: q }));
    if (!list.length) {
      setNotice({ kind: 'error', text: 'Pick at least one dish for this share.' });
      return;
    }
    setBusy(true);
    try {
      const r = await post<{ share_amount: number }>(`/api/t/${tcode}/claims`, { claims: list, label: label.trim() });
      setNotice({ kind: 'ok', text: `Share saved: ${npr(r.share_amount)}. Pay it at the counter.` });
      setClaims({});
      setLabel('');
      await reload();
    } catch (e) {
      setNotice({ kind: 'error', text: messageFor(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bill" aria-labelledby="bill-h">
      <h2 id="bill-h">The bill</h2>
      <table className="totals">
        <tbody>
          <tr><th scope="row">Food</th><td>{npr(bill.totals.subtotal)}</td></tr>
          <tr><th scope="row">Service charge (demo 10%)</th><td>{npr(bill.totals.service)}</td></tr>
          <tr><th scope="row">VAT (demo 13%)</th><td>{npr(bill.totals.tax)}</td></tr>
          <tr className="grand"><th scope="row">Total</th><td>{npr(bill.totals.total)}</td></tr>
          {bill.paid_npr > 0 ? <tr><th scope="row">Paid so far</th><td>{npr(bill.paid_npr)}</td></tr> : null}
          <tr><th scope="row">Still to pay</th><td>{npr(bill.due_npr)}</td></tr>
        </tbody>
      </table>

      <h3>Split the bill</h3>
      {bill.shares.length === 0 ? (
        <>
          <div className="split-choice">
            <div>
              <p className="split-title">Equally</p>
              <div className="cta-row">
                <label className="select">
                  <span className="sr">Number of people</span>
                  <select value={people} onChange={(e) => setPeople(Number(e.target.value))}>
                    {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n} people</option>)}
                  </select>
                </label>
                <button className="btn btn-ghost" onClick={splitEqual} disabled={busy}>Split equally</button>
              </div>
            </div>
          </div>
          <div className="split-choice">
            <div className="wide-block">
              <p className="split-title">By dish, each person claims what they had</p>
              <ul className="claim-list">
                {claimable.map((l) => (
                  <li key={l.line_key}>
                    <span>{l.name}</span>
                    <span className="muted small">{l.remaining} left · {npr(l.unit_price)}</span>
                    <div className="stepper" role="group" aria-label={`Claim of ${l.name}`}>
                      <button onClick={() => setClaims((c) => ({ ...c, [l.line_key]: Math.max(0, (c[l.line_key] || 0) - 1) }))} aria-label={`Claim one fewer ${l.name}`}>−</button>
                      <output aria-live="polite">{claims[l.line_key] || 0}</output>
                      <button onClick={() => setClaims((c) => ({ ...c, [l.line_key]: Math.min(l.remaining, (c[l.line_key] || 0) + 1) }))} aria-label={`Claim one more ${l.name}`}>+</button>
                    </div>
                  </li>
                ))}
              </ul>
              <label className="field">
                <span>Name on this share</span>
                <input value={label} maxLength={30} placeholder="e.g. Sita" onChange={(e) => setLabel(e.target.value)} />
              </label>
              <button className="btn btn-primary" onClick={claimShare} disabled={busy || claimable.length === 0}>Save my share</button>
            </div>
          </div>
        </>
      ) : (
        <p className="muted">{locked ? 'Split equally. The shares below add up to the bill.' : 'Split by dish. Claim the rest of the dishes or ask for the rest to be paid as one.'}</p>
      )}

      {bill.shares.length > 0 ? (
        <ol className="shares">
          {bill.shares.map((s) => (
            <li key={s.id} className={s.status === 'paid' ? 'paid' : ''}>
              <div>
                <b>{s.label}</b>
                {s.items.length ? <span className="muted small"> · {s.items.map((i) => `${i.qty} ${i.name}`).join(', ')}</span> : null}
              </div>
              <div>
                <span>{npr(s.amount)}</span>
                <span className="chip">{s.status === 'paid' ? 'Paid' : 'Open'}</span>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
      {bill.uncovered_npr > 0 && bill.shares.length > 0 ? (
        <p className="muted small">{npr(bill.uncovered_npr)} from new dishes is not split yet. Claim it by dish, or the staff will add it as one share.</p>
      ) : null}
    </section>
  );
}
