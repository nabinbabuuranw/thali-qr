# Thali QR · DESIGN.md (Day 7)

## Research (three to five references, read on 2026-11-09)
1. Square for Restaurants, split check (https://squareup.com/us/en/the-bottom-line/operating-your-business/split-restaurant-bills): split by seat is the default pattern; the bill is one object that can be cut into shares. Taken: bill split as a first-class action, not a footnote.
2. WowMenu QR ordering (https://wowmenu.me/features/qr-ordering-system/): guest scans, no app; the ticket lands on the kitchen display. Taken: the kitchen ticket is the unit that moves.
3. OrderTiger QR table ordering (https://www.ordertiger.com/qr-code-table-ordering): one code per table, straight to kitchen or bar. Taken: the table code is the identity of the guest session.
4. EasyBills QR ordering (https://easybills.ai/qr-code-ordering-system): one bill per table, QR and staff orders merged, split and tips at payment. Taken: one bill for the table, shares derived from it.
5. Cross-check: UI UX Pro Max design system (search "restaurant QR table ordering kitchen display bill splitting Nepal"): suggested red, gold and Playfair Display SC with Karla. Used only as a cross-check; the red-and-gold, serif-menu look is generic for restaurants, so it was not adopted.

Research conclusion: the three competitors all sell a QR menu with a kitchen ticket and a split. None of the four lead with the physical order rail, so the identity leans on the ticket rail.

## Direction: "Ticket Rail"
A restaurant kitchen rail: paper order tickets hang from a horizontal brass rail, and each ticket moves left to right from Received to Served. The guest sees the same ticket on their phone. The identity is a line, a clip and a ticket, not a grid of cards.

- Homepage: a dark ink band with a live rail animation (three tickets travel from table to kitchen to served, motion reduced under prefers-reduced-motion), then a horizontal rail of three steps (no card grid), then an interactive bill splitter (drag the share count), then staff entry as a ticket-stub strip.
- Dashboards: the kitchen display is a rail of stage columns (Received, Cooking, Ready, Served) with ticket cards clipped to the top edge; the floor is a table plan on a grid where each table is a numbered tile with a status tab; the manager is a menu board with price tags and a settings strip.
- Navigation: a dark ink top bar with a brass rail underline on the active item. Mobile uses a bottom stage bar on staff screens.
- Motif: a brass rail line with clip pins, paper tickets with a perforated top edge, and a 5x5 module QR-like mark as the logo.
- No three-feature card grid, no gradient, no pure white page, no emoji icons, no left colour stripes on cards.

## Palette (Coolors route, stated deviation)
- Hexes: ink #1F1B1E, paper #F9F3EF, rose #A3204A, brass #B7862A, teal-green #2D7A5F. Five hexes, one Coolors URL: https://coolors.co/1f1b1e-f9f3ef-a3204a-b7862a-2d7a5f
- Deviation: this palette was not picked on Nabin's logged-in Coolors account, because that login was not run in this build (Days 5 and 6 stated the same deviation). It was built by hand against WCAG contrast (see palettes_log.md) and never reused.
- Derived: card #FCF7F4, sunk #F1E6DF, line #E2D3C9, muted #5C5256, rose-deep #7F1738, rose-soft #F6DCE4, brass-ink #6E4E10, danger #B3261E, KDS background #1F1B1E, KDS text #F4ECE6.
- Contrast (WCAG 2.x): ink on paper 15.48:1; rose on paper 6.67:1; white on rose 7.34:1; brass-ink on paper 6.92:1; teal-green on paper 4.70:1; muted on paper 6.83:1; brass on KDS ink 5.23:1; KDS text on ink 14.58:1.

## Type
- Bricolage Grotesque (display and UI; variable, Fontsource) and Noto Sans Devanagari (Nepali names and labels). Money in tabular figures.

## Components and tokens
- Tokens are CSS custom properties in src/styles.css (:root). The palette is the only colour source.
- Radius 4px for controls, 8px for tickets; no shadow above a 1px line and one soft shadow for floating ticket.
- Motion: 180 to 320 ms ease-out on state; rail animation 9 s loop, paused by prefers-reduced-motion.
- Touch targets 44px minimum; focus ring 3px brass.
