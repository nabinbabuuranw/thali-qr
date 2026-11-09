import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from '../lib/router';
import { Header, Notice } from '../components/Shell';
import { splitEqual, MIN_PEOPLE, MAX_PEOPLE } from '../../shared/logic';
import { npr } from '../lib/format';

// Demo bill for the split demo. Invented prices, labelled DEMO on the page.
const DEMO_LINES = [
  { name: 'Dal bhat set, veg', price: 420 },
  { name: 'Chicken sekuwa, 2 plates', price: 680 },
  { name: 'Masala tea, 3 cups', price: 150 },
];

/** Scroll reveal that plays on the way down and plays back in reverse on the way up. */
function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setOn(true);
      return;
    }
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { threshold: 0.18 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${on ? 'is-in' : ''} ${className}`}>
      {children}
    </div>
  );
}

function SplitDemo() {
  const [people, setPeople] = useState(2);
  const total = DEMO_LINES.reduce((s, l) => s + l.price, 0);
  const shares = splitEqual(total, people);
  const uneven = shares.some((s) => s !== shares[0]);
  return (
    <div className="bill-card" aria-label="Bill split demo, invented prices">
      <p className="bill-head">Table T4 · demo bill</p>
      <ul className="bill-lines">
        {DEMO_LINES.map((l) => (
          <li key={l.name}>
            <span>{l.name}</span>
            <b>{npr(l.price)}</b>
          </li>
        ))}
      </ul>
      <div className="bill-sum">
        <span>Subtotal</span>
        <b>{npr(total)}</b>
      </div>
      <div className="people" role="group" aria-label="Number of people sharing the bill">
        <button type="button" onClick={() => setPeople((p) => Math.max(MIN_PEOPLE, p - 1))} disabled={people <= MIN_PEOPLE} aria-label="One person fewer">
          −
        </button>
        <output className="people-n" aria-live="polite">{people} people</output>
        <button type="button" onClick={() => setPeople((p) => Math.min(MAX_PEOPLE, p + 1))} disabled={people >= MAX_PEOPLE} aria-label="One person more">
          +
        </button>
      </div>
      <p className="share-line">
        Each share <b>{npr(shares[0])}</b>
        {uneven ? <span className="muted small"> · the last share takes the rounding</span> : null}
      </p>
    </div>
  );
}

export function Landing() {
  return (
    <>
      <Header />
      <main className="landing">
        <section className="hero-band" aria-labelledby="hero-title">
          <div className="hero-inner">
            <p className="kicker">Table QR ordering for restaurants in Nepal</p>
            <h1 id="hero-title">Scan the table. The order rides the rail to the kitchen.</h1>
            <p className="lede">
              Guests scan the code on their table, read the menu in English or नेपाली, and send the order. The kitchen sees each ticket move from new to served. The bill is one object that splits by seat or by dish.
            </p>
            <div className="cta-row">
              <Link to="/t/T4" className="btn btn-brass">Open table T4 as a guest</Link>
              <Link to="/login" className="btn btn-line">Staff sign-in</Link>
            </div>
          </div>
          <div className="rail-wrap" aria-hidden="true">
            <div className="rail-line" />
            {[
              { at: 6, label: 'Table' },
              { at: 36, label: 'Kitchen' },
              { at: 66, label: 'Ready' },
              { at: 94, label: 'Served' },
            ].map((s) => (
              <span key={s.label} className="rail-stop" style={{ left: `${s.at}%` }}>
                {s.label}
              </span>
            ))}
            <span className="rail-ticket" style={{ left: '6%', animationDelay: '0s' }}>T4<small>3 dishes · new</small></span>
            <span className="rail-ticket" style={{ left: '36%', animationDelay: '-4.6s' }}>T2<small>2 dishes · cooking</small></span>
            <span className="rail-ticket" style={{ left: '66%', animationDelay: '-9.2s' }}>T7<small>1 dish · ready</small></span>
          </div>
        </section>

        <Notice />

        <section className="stubs-sec" aria-labelledby="how">
          <Reveal>
            <h2 id="how">How a table runs</h2>
          </Reveal>
          <ol className="stubs">
            <li className="stub-li">
              <Reveal>
                <div className="stub">
                <span className="stub-tag">Scan</span>
                <h3>The menu opens for that table</h3>
                <p>Sold-out dishes are marked and cannot be sent. Prices come from the restaurant, not from the phone.</p>
                </div>
              </Reveal>
            </li>
            <li className="stub-li">
              <Reveal>
                <div className="stub">
                <span className="stub-tag">Cook</span>
                <h3>Each ticket moves along the rail</h3>
                <p>New, on the fire, ready to serve, served. Each ticket shows its table, dishes, notes and minutes waiting.</p>
                </div>
              </Reveal>
            </li>
            <li className="stub-li">
              <Reveal>
                <div className="stub">
                <span className="stub-tag">Settle</span>
                <h3>Split by seat, by dish, or equally</h3>
                <p>The floor marks each share paid in cash. The table frees itself when the bill is covered.</p>
                </div>
              </Reveal>
            </li>
          </ol>
        </section>

        <section className="split-sec" aria-labelledby="split">
          <Reveal className="split-copy">
            <h2 id="split">Split it the way the table wants</h2>
            <p>Change the number of people and each share updates from the same arithmetic the server uses. Shares add back to the bill to the paisa.</p>
          </Reveal>
          <Reveal>
            <SplitDemo />
          </Reveal>
        </section>

        <section className="staff-sec" aria-labelledby="staff">
          <Reveal>
            <h2 id="staff">Staff screens</h2>
            <p>Demo sign-in, one tap. These open the demo staff accounts only. A manager adds real staff with a temporary password.</p>
          </Reveal>
          <div className="staff-links">
            <Link to="/login?demo=kitchen" className="btn btn-ghost">Kitchen screen</Link>
            <Link to="/login?demo=floor" className="btn btn-ghost">Floor and bills</Link>
            <Link to="/login?demo=manager" className="btn btn-ghost">Manager</Link>
          </div>
        </section>
      </main>
      <footer className="foot">
        <p>
          Thali QR · a demo built in public as Day 7 of a 100-platform run. Invented menu, staff and tables; no real restaurant is named or used. <Link to="/terms">Terms</Link> · <Link to="/privacy">Privacy</Link>
        </p>
      </footer>
    </>
  );
}
