// Local harness: runs the same Worker (api/src/worker.ts) over an in-memory D1 stand-in, and serves dist/site as the ASSETS binding.
// For browser checks only. Usage: node tools/local-server.ts [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker, { type Env } from '../api/src/worker.ts';
import { D1Shim } from '../api/test/d1shim.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'site');
const port = Number(process.argv[2] || 8787);
const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json' };

const env: Env = {
  DB: new D1Shim() as any,
  ASSETS: {
    async fetch(req: Request) {
      const u = new URL(req.url);
      const p = path.join(root, decodeURIComponent(u.pathname));
      if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return new Response('not found', { status: 404 });
      const ext = path.extname(p);
      return new Response(fs.readFileSync(p), { status: 200, headers: { 'Content-Type': MIME[ext] || 'application/octet-stream' } });
    },
  },
};

http.createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const url = new URL(req.url || '/', `http://localhost:${port}`);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  const init: RequestInit = { method: req.method, headers };
  if (chunks.length && req.method !== 'GET' && req.method !== 'HEAD') init.body = Buffer.concat(chunks);
  const r = await worker.fetch(new Request(url, init), env);
  const out: Record<string, string | string[]> = {};
  r.headers.forEach((v, k) => { out[k] = v; });
  const sc = (r.headers as any).getSetCookie ? (r.headers as any).getSetCookie() : [];
  if (sc.length) out['set-cookie'] = sc;
  res.writeHead(r.status, out);
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(port, () => console.log('listening', port));
