# 0009 — Design direction "Signal"

Writing standard: ASD-STE100.

Status: accepted
Date: 2026-10-07

## Context

- Most intended users are not technical. The stock shadcn look feels like a developer tool.
- The owner wants an intuitive, calm and friendly app with a good-looking UX.
- A design study made the direction "Signal" (`docs/design/signal-reference.html`).

## Decision

- Use the direction "Signal". `docs/design.md` gives the rules, tokens and components.
- Re-theme shadcn. Do not replace it.
- Self-host the font (Archivo). The app makes no request to Google Fonts.
- Use ListCard rows for record lists. Use shadcn `Table` only for the Transactions list.
- Buckets get two new fields: `color` (identity hue) and `icon`. Spec §5.8 is updated.
- Light theme only in v2.

## Consequences

- Roadmap slice D.1 builds the design system and restyles the existing screens.
- Each later UI slice follows `docs/design.md`.
