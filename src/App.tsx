import { usePath, match } from './lib/router';
import { SessionProvider } from './lib/session';
import { Landing } from './pages/Landing';
import { TablePage } from './pages/TablePage';
import { Login } from './pages/Login';
import { Kitchen } from './pages/Kitchen';
import { Floor } from './pages/Floor';
import { Manage } from './pages/Manage';
import { Terms, Privacy } from './pages/Legal';
import { Header } from './components/Shell';

function Routes() {
  const path = usePath();
  let m: Record<string, string> | null;
  if ((m = match('/t/:code', path))) return <TablePage code={m.code} />;
  if (match('/login', path)) return <Login />;
  if (match('/kitchen', path)) return <Kitchen />;
  if (match('/floor', path)) return <Floor />;
  if (match('/manage', path)) return <Manage />;
  if (match('/terms', path)) return <Terms />;
  if (match('/privacy', path)) return <Privacy />;
  if (match('/', path)) return <Landing />;
  return (
    <>
      <Header />
      <main className="page narrow">
        <h1>Page not found</h1>
        <p>This page does not exist. <a href="/">Go to the start</a>.</p>
      </main>
    </>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <Routes />
    </SessionProvider>
  );
}
