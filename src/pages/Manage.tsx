import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Header } from '../components/Shell';
import { Banner, Skeleton } from '../components/ui';
import { get, post, put, messageFor } from '../lib/api';
import { npr } from '../lib/format';
import { useSession } from '../lib/session';
import { Login } from './Login';

interface MItem { id: number; name: string; name_ne: string; description: string; price_npr: number; diet: 'veg' | 'nonveg'; spice: number; available: boolean; prep_min: number; category_id: number }
interface MCat { id: number; name: string; name_ne: string; items: MItem[] }
interface MTable { id: number; code: string; label: string; seats: number; status: string }
interface MStaff { id: number; name: string; email: string; role: string; is_demo: boolean }
interface Manage {
  restaurant: { name: string; tax_pct: number; service_pct: number };
  categories: MCat[]; tables: MTable[]; staff: MStaff[]; audit: { at: number; actor: string; action: string; detail: string }[];
}
type Tab = 'menu' | 'tables' | 'settings' | 'staff' | 'log';
const TABS: { id: Tab; label: string }[] = [
  { id: 'menu', label: 'Menu' },
  { id: 'tables', label: 'Tables and QR' },
  { id: 'settings', label: 'Settings' },
  { id: 'staff', label: 'Staff' },
  { id: 'log', label: 'Changes' },
];

export function Manage() {
  const { staff, loading } = useSession();
  if (loading) return <><Header /><main className="page"><Skeleton rows={3} /></main></>;
  if (!staff) return <Login />;
  if (staff.role !== 'manager') return <><Header /><main className="page narrow"><Banner kind="error">Manage is for manager accounts.</Banner></main></>;
  return <ManageBoard />;
}

function ManageBoard() {
  const [tab, setTab] = useState<Tab>('menu');
  const [data, setData] = useState<Manage | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const load = async () => {
    try {
      setData(await get<Manage>('/api/manage/menu'));
    } catch (e) {
      setMsg({ kind: 'error', text: messageFor(e) });
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const say = (kind: 'ok' | 'error', text: string) => setMsg({ kind, text });
  return (
    <>
      <Header />
      <main className="manage">
        <div className="manage-head">
          <h1>Manage</h1>
          <p className="muted small">Changes here reach the guest menu on the next refresh.</p>
        </div>
        <nav className="manage-tabs" aria-label="Manage sections">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => { setTab(t.id); setMsg(null); }}>{t.label}</button>
          ))}
        </nav>
        {msg ? <Banner kind={msg.kind === 'ok' ? 'ok' : 'error'}>{msg.text}</Banner> : null}
        {!data ? <Skeleton rows={5} /> : null}
        {data && tab === 'menu' ? <MenuEditor data={data} reload={load} say={say} /> : null}
        {data && tab === 'tables' ? <Tables data={data} reload={load} say={say} /> : null}
        {data && tab === 'settings' ? <Settings data={data} reload={load} say={say} /> : null}
        {data && tab === 'staff' ? <StaffList data={data} reload={load} say={say} /> : null}
        {data && tab === 'log' ? (
          <ul className="audit">
            {data.audit.length === 0 ? <li className="muted">No changes yet.</li> : null}
            {data.audit.map((a, i) => (
              <li key={i}><span className="muted small">{new Date(a.at).toLocaleString('en-GB', { timeZone: 'Asia/Kathmandu' })}</span> <b>{a.actor}</b> {a.action.replace(/_/g, ' ')} <span className="muted small">{a.detail}</span></li>
            ))}
          </ul>
        ) : null}
      </main>
    </>
  );
}

type Say = (kind: 'ok' | 'error', text: string) => void;

function MenuEditor({ data, reload, say }: { data: Manage; reload: () => Promise<void>; say: Say }) {
  const [draft, setDraft] = useState({ category_id: data.categories[0]?.id || 0, name: '', name_ne: '', description: '', price_npr: 200, diet: 'veg' as 'veg' | 'nonveg', spice: 1, prep_min: 12 });
  const add = async () => {
    try {
      await post('/api/manage/items', draft);
      say('ok', `Added ${draft.name}. It is on the guest menu now.`);
      setDraft({ ...draft, name: '', name_ne: '', description: '' });
      await reload();
    } catch (e) {
      say('error', messageFor(e));
    }
  };
  const addCat = async () => {
    const name = window.prompt('Category name (English)');
    if (!name) return;
    try {
      await post('/api/manage/categories', { name, name_ne: '' });
      await reload();
    } catch (e) {
      say('error', messageFor(e));
    }
  };
  return (
    <section className="manage-sec">
      <div className="split-2">
        <div>
          {data.categories.map((c) => (
            <div key={c.id} className="cat-block">
              <h2>{c.name} <span className="ne">{c.name_ne}</span></h2>
              <ul className="edit-list">
                {c.items.map((it) => <ItemRow key={it.id} item={it} reload={reload} say={say} />)}
              </ul>
            </div>
          ))}
          <button className="btn btn-ghost" onClick={addCat}>Add a category</button>
        </div>
        <aside className="add-box" aria-labelledby="add-h">
          <h2 id="add-h">Add a dish</h2>
          <label className="field"><span>Category</span>
            <select value={draft.category_id} onChange={(e) => setDraft({ ...draft, category_id: Number(e.target.value) })}>
              {data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="field"><span>Name</span><input value={draft.name} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label className="field"><span>Name in नेपाली (optional)</span><input value={draft.name_ne} maxLength={60} onChange={(e) => setDraft({ ...draft, name_ne: e.target.value })} /></label>
          <label className="field"><span>Description</span><input value={draft.description} maxLength={240} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
          <div className="row2">
            <label className="field"><span>Price NPR</span><input type="number" min={0} max={100000} value={draft.price_npr} onChange={(e) => setDraft({ ...draft, price_npr: Number(e.target.value) })} /></label>
            <label className="field"><span>Minutes</span><input type="number" min={1} max={120} value={draft.prep_min} onChange={(e) => setDraft({ ...draft, prep_min: Number(e.target.value) })} /></label>
          </div>
          <div className="row2">
            <label className="field"><span>Diet</span>
              <select value={draft.diet} onChange={(e) => setDraft({ ...draft, diet: e.target.value as 'veg' | 'nonveg' })}><option value="veg">Vegetarian</option><option value="nonveg">Non-vegetarian</option></select>
            </label>
            <label className="field"><span>Spice 0–3</span><input type="number" min={0} max={3} value={draft.spice} onChange={(e) => setDraft({ ...draft, spice: Number(e.target.value) })} /></label>
          </div>
          <button className="btn btn-primary wide" disabled={!draft.name.trim()} onClick={add}>Add to the menu</button>
        </aside>
      </div>
    </section>
  );
}

function ItemRow({ item, reload, say }: { item: MItem; reload: () => Promise<void>; say: Say }) {
  const [price, setPrice] = useState(item.price_npr);
  const [avail, setAvail] = useState(item.available);
  const dirty = price !== item.price_npr || avail !== item.available;
  const save = async () => {
    try {
      await put(`/api/manage/items/${item.id}`, { price_npr: price, available: avail });
      say('ok', `${item.name} saved.`);
      await reload();
    } catch (e) {
      say('error', messageFor(e));
    }
  };
  return (
    <li className={avail ? '' : 'off'}>
      <span className="it-name">{item.name} <span className="muted small">{item.diet === 'veg' ? 'veg' : 'non-veg'}</span></span>
      <label className="inline"><span className="sr">Price of {item.name}</span><input type="number" min={0} max={100000} value={price} onChange={(e) => setPrice(Number(e.target.value))} /></label>
      <label className="toggle"><input type="checkbox" checked={avail} onChange={(e) => setAvail(e.target.checked)} /> <span>{avail ? 'On the menu' : 'Sold out'}</span></label>
      <button className="btn btn-small" disabled={!dirty} onClick={save}>Save</button>
      <span className="muted small">{npr(item.price_npr)}</span>
    </li>
  );
}

function Tables({ data, reload, say }: { data: Manage; reload: () => Promise<void>; say: Say }) {
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [seats, setSeats] = useState(4);
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const add = async () => {
    try {
      await post('/api/manage/tables', { code, label, seats });
      say('ok', `Table ${code.toUpperCase()} added.`);
      setCode(''); setLabel('');
      await reload();
    } catch (e) {
      say('error', messageFor(e));
    }
  };
  return (
    <section className="manage-sec">
      <p className="muted small">Each table has one QR card. Print the link below as a QR, or open the code image to print it. The QR points at this table only.</p>
      <ul className="qr-grid">
        {data.tables.map((t) => <QrCard key={t.id} table={t} base={base} />)}
      </ul>
      <div className="add-box inline-form">
        <h2>Add a table</h2>
        <label className="field"><span>Code (letters and numbers, up to 6)</span><input value={code} maxLength={6} onChange={(e) => setCode(e.target.value)} /></label>
        <label className="field"><span>Label</span><input value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} /></label>
        <label className="field"><span>Seats</span><input type="number" min={1} max={20} value={seats} onChange={(e) => setSeats(Number(e.target.value))} /></label>
        <button className="btn btn-primary" onClick={add} disabled={!code.trim()}>Add table</button>
      </div>
    </section>
  );
}

function QrCard({ table, base }: { table: MTable; base: string }) {
  const url = `${base}/t/${table.code}`;
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let live = true;
    QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#1D2A22', light: '#FBF6EA' }, width: 180 })
      .then((s: string) => { if (live) setSvg(s); })
      .catch(() => { if (live) setSvg(''); });
    return () => { live = false; };
  }, [url]);
  return (
    <li className="qr-card">
      <div className="qr-img" dangerouslySetInnerHTML={{ __html: svg }} aria-label={`QR code for table ${table.code}`} role="img" />
      <div>
        <b>Table {table.code}</b> <span className="muted small">{table.label} · {table.seats} seats</span>
        <p className="small"><a href={`/t/${table.code}`}>{`/t/${table.code}`}</a></p>
      </div>
    </li>
  );
}

function Settings({ data, reload, say }: { data: Manage; reload: () => Promise<void>; say: Say }) {
  const [name, setName] = useState(data.restaurant.name);
  const [tax, setTax] = useState(data.restaurant.tax_pct);
  const [svc, setSvc] = useState(data.restaurant.service_pct);
  const save = async () => {
    try {
      await put('/api/manage/settings', { restaurant_name: name, tax_pct: tax, service_pct: svc });
      say('ok', 'Settings saved. Guests see them on the next refresh.');
      await reload();
    } catch (e) {
      say('error', messageFor(e));
    }
  };
  return (
    <section className="manage-sec narrow-sec">
      <label className="field"><span>Restaurant name</span><input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></label>
      <label className="field"><span>VAT, percent (0–30)</span><input type="number" min={0} max={30} value={tax} onChange={(e) => setTax(Number(e.target.value))} /></label>
      <label className="field"><span>Service charge, percent (0–20)</span><input type="number" min={0} max={20} value={svc} onChange={(e) => setSvc(Number(e.target.value))} /></label>
      <p className="muted small">Service is charged on food; VAT is charged on food plus service. Check the rate for your own bill before you use it for real.</p>
      <button className="btn btn-primary" onClick={save}>Save settings</button>
    </section>
  );
}

function StaffList({ data, reload, say }: { data: Manage; reload: () => Promise<void>; say: Say }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'kitchen' | 'floor' | 'manager'>('floor');
  const [pw, setPw] = useState<string | null>(null);
  const add = async () => {
    try {
      const r = await post<{ temporary_password: string }>('/api/manage/staff', { name, email, role });
      setPw(r.temporary_password);
      say('ok', `Added ${name}. Copy the temporary password now; it is shown once.`);
      setName(''); setEmail('');
      await reload();
    } catch (e) {
      say('error', messageFor(e));
    }
  };
  return (
    <section className="manage-sec">
      <ul className="staff-list">
        {data.staff.map((s) => (
          <li key={s.id}><b>{s.name}</b> <span className="muted small">{s.email} · {s.role}{s.is_demo ? ' · DEMO account' : ''}</span></li>
        ))}
      </ul>
      <div className="add-box inline-form">
        <h2>Add a staff member</h2>
        <label className="field"><span>Name</span><input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field"><span>Work email</span><input type="email" value={email} maxLength={120} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field"><span>Role</span>
          <select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            <option value="kitchen">Kitchen (tickets)</option>
            <option value="floor">Floor (tables and cash)</option>
            <option value="manager">Manager (everything)</option>
          </select>
        </label>
        <button className="btn btn-primary" onClick={add} disabled={!name.trim() || !email.trim()}>Add with a temporary password</button>
        {pw ? <p className="temp-pw">Temporary password: <code>{pw}</code></p> : null}
      </div>
    </section>
  );
}
