// Bundles the API Worker and copies the built SPA next to it: dist/site is the folder that gets published.
// Usage: node api/build.mjs   (after vite build)
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist/site');
if (!fs.existsSync(path.join(out, 'index.html'))) throw new Error('run vite build first');
// The Worker serves the SPA shell (so its security headers apply to every page).
fs.renameSync(path.join(out, 'index.html'), path.join(out, 'app-shell.html'));
fs.rmSync(path.join(out, 'public'), { recursive: true, force: true });
await build({
  entryPoints: [path.join(root, 'api/src/worker.ts')],
  bundle: true, format: 'esm', platform: 'neutral', target: 'es2022',
  outfile: path.join(out, '_worker.js'), legalComments: 'none', logLevel: 'warning', minify: true,
});
fs.writeFileSync(path.join(out, 'tab-site.json'), JSON.stringify({
  kind: 'worker', entry: '_worker.js', bindings: [{ type: 'd1', name: 'DB' }],
  worker: { compatibility_date: '2026-08-01', compatibility_flags: ['nodejs_compat'], html_handling: 'none', not_found_handling: 'none', assets_binding: 'ASSETS' },
}, null, 2));
let total = 0;
const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const s = fs.statSync(p); if (s.isDirectory()) walk(p); else total += s.size; } };
walk(out);
console.log('worker', fs.statSync(path.join(out, '_worker.js')).size, 'bytes; site total', total, 'bytes');
