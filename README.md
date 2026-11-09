# Thali QR (Day 7 of 100 Platforms)

Restaurant table ordering for Nepal. A guest scans the code on the table, reads the menu in English or नेपाली, and sends the order. The kitchen sees each ticket move from New to Served. The floor settles the bill in cash, split equally between 2 and 10 people, by dish, or as one bill. Demo data only.

- Live: https://thali-qr.sites.tab.bot/ (HTTP 200)
- Repository: https://github.com/nabinbabuuranw/thali-qr (MIT)
- Demo sign-in, one tap: Kitchen screen, Floor and bills, Manager (on the start page). No password.
- Guest demo: table T4 (https://thali-qr.sites.tab.bot/t/T4)

## Concept

Restaurants in Nepal lose time to waiting for a server to take a dish, and to the arithmetic of splitting a bill. Thali QR puts the menu on the table, sends each order straight to a kitchen ticket with a clock on it, and settles the bill with the split the table asks for. Three roles: guest (no account), kitchen (tickets), floor (tables and bills), manager (menu, tables, settings, staff, change log).

Researched against Square for Restaurants (split by seat), WowMenu and OrderTiger (QR table ordering with a kitchen ticket), and EasyBills (one bill per table). See DESIGN.md.

## Design direction: Ticket Rail

A kitchen rail: paper order tickets move left to right along a brass rail from Received to Served. The identity is a rail, a ticket with a perforation, and a five-by-three module grid in the logo. The homepage is a dark band with the rail animating, a stub rail for the three steps, a live bill splitter, and staff entry. The kitchen board is four stages under brass rails. The floor is a tile plan of tables. The manager is a menu board behind a rail-topped tab bar.

## Palette

Source: https://coolors.co/1f1b1e-f9f3ef-a3204a-b7862a-2d7a5f
- Ink #1F1B1E (text, kitchen background)
- Paper #F9F3EF (page), card #FCF7F4, sunk #F1E6DF, line #E2D3C9
- Rose #A3204A (primary), rose-deep #7F1738, rose-soft #F6DCE4
- Brass #B7862A (rail and accent), brass-ink #6E4E10
- Teal-green #2D7A5F (ready, paid, veg), danger #B3261E
- Stated deviation: this palette was built from these five hexes and not picked on Nabin's logged-in Coolors account, which was not used in this build. Days 5 and 6 stated the same deviation. The palette is logged in /home/user/tab/files/palettes_log.md and is not reused.

## Type

Bricolage Grotesque (variable, self-hosted) for display and text; Noto Sans Devanagari for नेपाली names. Money uses tabular figures.

## Stack

- App: React 18, Vite 5, TypeScript, plain CSS with design tokens. No CSS framework, no icon library; the logo and diet marks are inline SVG.
- API: one Cloudflare Worker over D1 (the `DB` binding). The Worker serves `/api/*` and the app shell; static files come from the `ASSETS` binding.
- Auth: PBKDF2-SHA256 password hashes (100,000 iterations). Server-side sessions keyed by a SHA-256 of the token, HttpOnly, Secure, SameSite=Lax cookie, 12 hours. Staff roles: kitchen, floor, manager, enforced on every `/api/kds`, `/api/floor` and `/api/manage` route.
- Bill arithmetic lives once in `shared/logic.ts` and is used by the Worker, the tests and the landing page demo. Money is whole rupees; service and VAT are applied as the restaurant sets them (demo 10% and 13%).
- Tests: `node:test` (23 tests: 11 logic, 12 API including RBAC and the 404 status). Browser checks: Python Playwright (`tools/browser_check.py`).

## How to run

```
npm install
npm run build          # typecheck, Vite build, bundles the Worker into dist/site
npm test               # 23 tests
node tools/local-server.ts 8791   # runs the same Worker over an in-memory D1 stand-in
python3 tools/browser_check.py http://localhost:8791 qa/shots   # 88 browser checks at 375, 768, 1024, 1440
```

Deploy: publish `dist/site` as a worker site with a D1 binding named `DB` (`tab-site.json` declares it).

## Layout

```
api/src/worker.ts     Worker: routes, auth, validation, seed
api/src/schema.ts     D1 schema and demo seed (labelled DEMO)
api/src/crypto.ts     PBKDF2 and token helpers
api/test/             node:test suites
shared/logic.ts       bill, claim, split and order rules
src/                  React app: pages, shell, router, API client
tools/                local harness and browser checks
docs/                 DESIGN.md, AUDIT_30.md, QA_REPORT.md, screenshots, Lighthouse report
```

## Limits

- Demo only: invented restaurant, menu, tables, staff and guests (labelled DEMO). No real restaurant is named.
- No payment is taken. Bills are marked paid in cash by staff. eSewa and Khalti are not connected and are not simulated.
- One restaurant per deployment. Gregorian dates only. No SMS, no email, no printed receipts.
- Terms and Privacy are demo-level drafts, not reviewed by a lawyer. A real deployment needs its own.
- Not tested on a real phone or on a slow network. Lighthouse was run on the local build of the home page, not on the live URL.
- Expenses: $0. Revenue: $0 (no paying customer).
