import { useState } from 'react';
import { Header } from '../components/Shell';
import { Banner, Empty, Skeleton } from '../components/ui';
import { get, post, messageFor } from '../lib/api';
import { npr, TABLE_LABEL, clock } from '../lib/format';
import { usePoll } from '../lib/poll';
import { useSession } from '../lib/session';
import { Login } from './Login';

interface Share { id: number; label: string; amount: number; status: string; items: { name: string; qty: number }[] }
interface Bill { bill_id: number; totals: { total: number; subtotal: number }; shares: Share[]; due_npr: number; uncovered_npr: number; paid_npr: number }
interface FloorTable { id: number; code: string; label: string; seats: number; status: string; kitchen_open: number; bill: Bill | null }

export function Floor() {
  const { staff, loading } = useSession();
  if (loading) return <><Header /><main className="page"><Skeleton rows={3} /></main></>;
  if (!staff) return <Login />;
  if (staff.role === 'kitchen') {
    return (
      <>
        <Header />
        <main className="page narrow"><Banner kind="error">Your account has the kitchen screen. The floor screen is for floor and manager accounts.</Banner></main>
      </>
    );
  }
  return <FloorBoard />;
}

function FloorBoard() {
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const feed = usePoll(() => get<{ tables: FloorTable[] }>('/api/floor/tables'), 8000);
  const tables = feed.data?.tables || [];
  const sel = tables.find((t) => t.code === open) || null;

  const markPaid = async (billId: number, shareId: number) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await post<{ closed: boolean }>(`/api/floor/bills/${billId}/shares/${shareId}/paid`);
      setMsg({ kind: 'ok', text: r.closed ? 'All shares paid. Table is free.' : 'Share marked paid in cash.' });
      await feed.reload();
    } catch (e) {
      setMsg({ kind: 'error', text: messageFor(e) });
    } finally {
      setBusy(false);
    }
  };
  const settleAll = async (billId: number, total: number) => {
    if (!window.confirm(`Settle the whole bill of ${npr(total)} in cash and free the table?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      await post(`/api/floor/bills/${billId}/settle`);
      setMsg({ kind: 'ok', text: 'Bill settled in cash. Table is free.' });
      setOpen(null);
      await feed.reload();
    } catch (e) {
      setMsg({ kind: 'error', text: messageFor(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Header />
      <main className="floor">
        <div className="floor-head">
          <div>
            <h1>Floor</h1>
            <p className="muted small">Tables, open bills and cash settlement. Refreshes every 8 seconds.</p>
          </div>
          <span className={`live ${feed.error ? 'live-off' : ''}`} role="status">{feed.error ? 'Connection lost' : 'Live'}</span>
        </div>
        {msg ? <Banner kind={msg.kind === 'ok' ? 'ok' : 'error'}>{msg.text}</Banner> : null}
        {!feed.data && !feed.error ? <Skeleton rows={6} /> : null}
        {feed.data && tables.length === 0 ? <Empty title="No tables yet">A manager adds tables under Manage.</Empty> : null}
        <div className="floor-grid">
          <ul className="ledger" aria-label="Tables">
            {tables.map((t) => (
              <li key={t.id}>
                <button className={`row ${open === t.code ? 'on' : ''} st-${t.status}`} onClick={() => setOpen(t.code)} aria-pressed={open === t.code}>
                  <span className="row-code">{t.code}</span>
                  <span className="row-label">{t.label}<span className="muted small"> · {t.seats} seats</span></span>
                  <span className={`chip chip-${t.status}`}>{TABLE_LABEL[t.status]}</span>
                  <span className="row-amt">{t.bill ? npr(t.bill.due_npr) : 'No bill'}</span>
                  {t.kitchen_open > 0 ? <span className="kitchen-dot" title={`${t.kitchen_open} dish order(s) still in the kitchen`}>{t.kitchen_open} in kitchen</span> : null}
                </button>
              </li>
            ))}
          </ul>

          <aside className="panel" aria-live="polite">
            {!sel ? <p className="muted">Pick a table to see its bill.</p> : (
              <>
                <h2>Table {sel.code} · {sel.label}</h2>
                {!sel.bill ? <p className="muted">No open bill at this table.</p> : (
                  <>
                    <p className="muted small">Bill {sel.bill.bill_id} · total {npr(sel.bill.totals.total)} · paid {npr(sel.bill.paid_npr)}</p>
                    {sel.bill.shares.length === 0 ? <p className="muted">Not split yet. Settle the whole bill, or wait for the guests to split it.</p> : (
                      <ol className="shares">
                        {sel.bill.shares.map((s) => (
                          <li key={s.id} className={s.status === 'paid' ? 'paid' : ''}>
                            <div>
                              <b>{s.label}</b>
                              {s.items.length ? <span className="muted small"> · {s.items.map((i) => `${i.qty} ${i.name}`).join(', ')}</span> : null}
                            </div>
                            <div>
                              <span>{npr(s.amount)}</span>
                              {s.status === 'paid' ? <span className="chip">Paid</span> : (
                                <button className="btn btn-small" disabled={busy} onClick={() => markPaid(sel.bill!.bill_id, s.id)}>Mark paid (cash)</button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                    {sel.bill.uncovered_npr > 0 ? <p className="muted small">{npr(sel.bill.uncovered_npr)} not split yet.</p> : null}
                    <button className="btn btn-primary wide" disabled={busy} onClick={() => settleAll(sel.bill!.bill_id, sel.bill!.totals.total)}>
                      Settle the whole bill in cash
                    </button>
                  </>
                )}
                <p className="muted small fine">Last refresh {clock(Date.now())}. Cash only: no card or wallet is taken here.</p>
              </>
            )}
          </aside>
        </div>
      </main>
    </>
  );
}
