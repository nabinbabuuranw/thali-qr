# Anti-AI UI audit, 30 points · Thali QR (Day 7)

Method: each point checked in the code (grep of src/styles.css and src/**/*.tsx) and in the 375, 768, 1024 and 1440 px screenshots. Results: pass, or a reasoned exception with the reason. Date: 2026-11-09.

| # | Point | Result | Evidence |
|---|---|---|---|
| 1 | Harsh gradients | Pass (one reasoned exception) | The only gradient is the skeleton loader's shimmer (`.sk-row`), a loading state that stops under reduced motion. |
| 2 | Pure white backgrounds | Pass | Paper #F9F3EF, card #FCF7F4. No #FFF or white in tokens. |
| 3 | Rainbow colouring | Pass | Five hexes plus derived tints: ink, paper, rose, brass, teal-green. |
| 4 | Heavy drop shadows | Pass | Shadow token is a 1px line only; the only box-shadow is an inset 4px rose bar on a selected table tile. |
| 5 | Liquid glass | Pass | No backdrop-filter or blur in the stylesheet. |
| 6 | Generic purple and black | Pass | Rose, brass and teal-green on warm ink; no purple. |
| 7 | Radial orbs | Pass | No radial-gradient in the stylesheet. |
| 8 | Excessive neon | Pass | Saturation is held to the rose and brass tokens. |
| 9 | Basic pastel palettes | Pass | Rose and brass are not pastel; the kitchen is a dark ink board. |
| 10 | Default icon library | Pass | No icon library in package.json. Logo and veg/non-veg marks are custom inline SVG. |
| 11 | Emojis as UI icons | Pass | grep for emoji ranges in src: 0. |
| 12 | Default Inter, Geist or Space Grotesk | Pass | Bricolage Grotesque with Noto Sans Devanagari. |
| 13 | Unnecessary sparkle icons | Pass | None. |
| 14 | Animated arrows | Pass | No arrow glyphs or arrow animation in src (grep for arrows: 0). |
| 15 | Hover animation on every element | Pass | Hover changes on buttons, tiles and links only (9 :hover rules). |
| 16 | Repetitive three-feature-card layout | Pass | Three steps are a stub rail under brass rules, not cards. |
| 17 | Coloured left stripes on cards | Pass | The one left border (the demo note) was changed to a top rule. Kitchen tickets use an outline for late orders. |
| 18 | Repetitive bento grids | Pass | No bento. The floor is a tile plan with real table status. |
| 19 | Terminal mockups | Pass | None. |
| 20 | Generic three-tier pricing | Pass | No pricing page. |
| 21 | Generic soft rounded corners | Pass | Radius 4px for controls, 3px for tickets. |
| 22 | Dot-grid backgrounds | Pass | None. The bill has a dotted rule between lines only. |
| 23 | Excessive em dashes | Pass | grep for the em dash in src: 0. |
| 24 | "It's not X, it's Y" copy | Pass | grep for the pattern in src: 0. |
| 25 | Repetitive checkmark lists | Pass | No check bullets. |
| 26 | Fake testimonials | Pass | None. |
| 27 | Missing real product demo | Pass | Working guest order flow, kitchen ticket moves, equal split, and the live bill splitter on the landing. |
| 28 | Missing skeleton loaders | Pass | Skeleton component used while data loads on the table menu, Kitchen, Floor and Manage. |
| 29 | Missing Terms of Service | Pass | /terms (demo-level draft, see README limits). |
| 30 | Missing Privacy Policy | Pass | /privacy (demo-level draft, see README limits). |

Result: 30 of 30 points pass; point 1 carries a reasoned exception (the skeleton shimmer).

Motion check: the rail animation and the scroll reveal are off under prefers-reduced-motion (computed animation name `none` at 375 px with reduced motion, confirmed by the browser pass). The reveal plays down and back up with the scroll position.
