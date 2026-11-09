# QA report · Thali QR (Day 7)

Date: 2026-11-09. Build: commit history in the repo; local harness and live site run the same build (JS bundle index-BFsUvZzt.js).

## What was run, and the real counts

| Check | Command or tool | Result |
|---|---|---|
| Typecheck and build | `npm run build` (tsc for the app and the Worker, Vite, esbuild bundle of the Worker) | Passes (last run after the final change). Worker bundle 34,683 bytes; site 672 KB. |
| API and logic tests | `npm test` (node:test) | 23 of 23 pass (11 logic, 12 API). Covers role gates (403 for wrong role), login lockout, bill and claim arithmetic, equal split, kitchen one-step moves, and the 404 status for unknown paths. |
| Browser checks, four widths | `python3 tools/browser_check.py` (Python Playwright, Chromium) | 88 of 88 pass on the final build at 375, 768, 1024 and 1440 px. Checks: no sideways scroll, no page errors, no failed API responses, guest order placed, equal split, kitchen moves a ticket, floor settles, manager menu edits. |
| Screenshots | Playwright full-page captures, final code | 29 full-page captures: landing, table, kitchen, floor, manage, terms and not-found at 375, 768, 1024 and 1440 px, plus a reduced-motion landing. 36 more from the 88-check run (bill, split, review, table menu, manage tabs). All in screenshots/. |
| Reduced motion | Playwright with reduced_motion=reduce | Rail animation name `none`. |
| Lighthouse, mobile, home page (local build) | Lighthouse 12, headless Chromium | Performance 91, Accessibility 100, Best Practices 100, SEO 100. LCP 2.9 s, CLS 0, TBT 0 ms. Report in lighthouse/. Not run on the live URL. |
| Live site | curl on the published address | `/` 200, `/login` 200, `/api/menu` 200, `/nope` 404, `/t/T4` 200. Publish receipt: status published, answered 200. |
| Coolors | not run on Nabin's account | Stated deviation (see README). |

## Found and fixed during QA

- Browser check could not create tables over plain HTTP: the session cookie is Secure, so the requests client never sent it back. Fixed in the check script (the cookie is sent by hand); the app was not changed for this.
- Unknown paths answered 200 with the shell (a soft 404). Fixed in the Worker: only the start, login, staff, legal and table-code paths return 200; anything else returns the not-found page with status 404. A test now guards it.
- Reduced motion did not stop the rail animation. Fixed with a reduced-motion rule for the rail and the reveal.
- The floor tile with no bill read "none" in bold. Changed to "No bill".
- A left-border accent on the demo note (a coloured stripe) was changed to a top rule.
- Early layout: the hero used a split layout, and the rail stop labels sat under the tickets. Both changed; the final captures were taken after the change.

## Not covered

- No real-phone test and no slow-network test.
- Playwright end-to-end is the Python check script, not the Playwright test runner with a committed spec suite.
- Lighthouse was not run on the other routes or on the live URL.
- The 30-point audit was done by code search and screenshot review, not by a second reviewer.
- Auth beyond the demo sign-in was not tested with real staff accounts (none exist).
