import { Header } from '../components/Shell';
import { Banner, Empty, Skeleton } from '../components/ui';
import { DietMark } from '../components/Mark';
import { get, post, messageFor } from '../lib/api';
import { usePoll } from '../lib/poll';
import { useSession } from '../lib/session';
import { Login } from './Login';
import { useState } from 'react';
import { minutesLabel } from '../lib/format';

interface Ticket {
  id: number; number: number; status: 'received' | 'cooking' | 'ready'; note: string; minutes: number;
  table: { code: string; label: string };
  items: { name: string; diet: 'veg' | 'nonveg'; qty: number; note: string }[];
}

const COLUMNS: { status: Ticket['status']; title: string; next: 'cooking' | 'ready' | null; action: string }[] = [
  { status: 'received', title: 'New', next: 'cooking', action: 'Start cooking' },
  { status: 'cooking', title: 'On the fire', next: 'ready', action: 'Mark ready' },
  { status: 'ready', title: 'Ready to serve', next: null, action: '' },
];

export function Kitchen() {
  const { staff, loading } = useSession();
  if (loading) return <><Header tone="kitchen" /><main className="kds"><Skeleton rows={3} /></main></>;
  if (!staff) return <Login />;
  return <Board />;
}

function Board() {
  const { staff } = useSession();
  const [err, setErr] = useState<string | null>(null);
  const feed = usePoll(() => get<{ tickets: Ticket[]; now: number }>('/api/kds/tickets'), 5000);
  const canServe = staff?.role !== 'kitchen';

  const move = async (t: Ticket, to: 'cooking' | 'ready' | 'served') => {
    setErr(null);
    try {
      await post(`/api/kds/orders/${t.id}/status`, { status: to });
      await feed.reload();
    } catch (e) {
      setErr(messageFor(e));
      await feed.reload();
    }
  };

  const tickets = feed.data?.tickets || [];
  return (
    <>
      <Header tone="kitchen" />
      <main className="kds">
        <div className="kds-head">
          <div>
            <h1>Kitchen</h1>
            <p className="muted-dark small">{tickets.length} open {tickets.length === 1 ? 'ticket' : 'tickets'} · refreshes every 5 seconds</p>
          </div>
          <span className={`live ${feed.error ? 'live-off' : ''}`} role="status">{feed.error ? 'Connection lost, retrying' : 'Live'}</span>
        </div>
        {err ? <Banner kind="error">{err}</Banner> : null}
        {!feed.data && !feed.error ? <Skeleton rows={4} /> : null}
        <div className="columns">
          {COLUMNS.map((col) => {
            const list = tickets.filter((t) => t.status === col.status);
            return (
              <section key={col.status} className="column" aria-labelledby={`col-${col.status}`}>
                <h2 id={`col-${col.status}`}>{col.title} <span className="count">{list.length}</span></h2>
                {list.length === 0 ? <Empty title="Nothing here" /> : null}
                {list.map((t) => (
                  <article key={t.id} className={`ticket ${t.minutes >= 15 && t.status !== 'ready' ? 'late' : ''}`}>
                    <header>
                      <span className="ticket-table">{t.table.code}</span>
                      <span className="ticket-no">#{t.number}</span>
                      <span className="ticket-age">{minutesLabel(t.minutes)}</span>
                    </header>
                    <ul>
                      {t.items.map((i, idx) => (
                        <li key={idx}>
                          <DietMark diet={i.diet} />
                          <span className="qty">{i.qty}×</span>
                          <span>{i.name}</span>
                          {i.note ? <em>{i.note}</em> : null}
                        </li>
                      ))}
                    </ul>
                    {t.note ? <p className="ticket-note">Note: {t.note}</p> : null}
                    <div className="ticket-actions">
                      {col.next ? (
                        <button className="btn btn-kds" onClick={() => move(t, col.next!)}>{col.action}</button>
                      ) : canServe ? (
                        <button className="btn btn-kds" onClick={() => move(t, 'served')}>Served to table</button>
                      ) : (
                        <span className="muted-dark small">Waiting for floor to serve</span>
                      )}
                    </div>
                  </article>
                ))}
              </section>
            );
          })}
        </div>
      </main>
    </>
  );
}
