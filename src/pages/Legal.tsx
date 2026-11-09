import { Header } from '../components/Shell';
import { Link } from '../lib/router';

export function Terms() {
  return (
    <>
      <Header />
      <main className="page narrow legal">
        <h1>Terms of use (demo)</h1>
        <p>Thali QR is a demonstration. It runs on invented data: the restaurant, menu, prices, tables, staff and guests are fictional and labelled DEMO.</p>
        <p>You may try the guest menu, place orders, split bills and sign in to the demo kitchen, floor and manager screens. Please do not enter real card numbers, real personal details or real customer information.</p>
        <p>No payment is taken. Bills are marked paid by staff in cash, and eSewa and Khalti are not connected. The demo is provided as it is, without a guarantee of uptime or of any outcome.</p>
        <p>Any real deployment for a restaurant would need its own terms, its own tax rates checked by the restaurant, and its own agreement on data handling.</p>
        <p><Link to="/privacy">Privacy notes</Link> · <Link to="/">Back to the start</Link></p>
      </main>
    </>
  );
}

export function Privacy() {
  return (
    <>
      <Header />
      <main className="page narrow legal">
        <h1>Privacy notes (demo)</h1>
        <p><b>Guests.</b> Scanning a table code stores nothing about you. Your cart lives in this browser's local storage until you place an order. An order stores the dishes, quantities, the notes you typed, the table, and the time. A bill share stores the name you typed for it, if any.</p>
        <p><b>Staff.</b> A staff account stores a name, a work email, a role, and a password hash (PBKDF2-SHA256, never the password itself). Sign-in sessions are stored as hashes with a 12-hour life. Failed sign-ins are counted per email for 15 minutes.</p>
        <p><b>Audit.</b> Settlements, price and availability changes, and staff additions are written to a short change log that managers can read.</p>
        <p><b>Demo accounts.</b> The three demo staff accounts have no password. They open with a one-tap sign-in that only works for the demo.</p>
        <p><b>Deleting data.</b> This demo has no self-service deletion yet. Data in the demo is reset when the demo is redeployed. Nothing here is linked to a real person or a real business.</p>
        <p><Link to="/terms">Terms of use</Link> · <Link to="/">Back to the start</Link></p>
      </main>
    </>
  );
}
