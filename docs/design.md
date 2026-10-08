# Num — Design (direction "Signal")

Writing standard: ASD-STE100.

Status: **approved** (decision 0009). This file is the source of truth for the look of the web app.
The visual reference is `docs/design/signal-reference.html`. Open it in a browser. It uses synthetic data.

## 1. Principles

1. **Colour is a signal.** Strong colour tells the user one of three things:
   - Iris: "you can do this" (main buttons, selection, progress, links).
   - Tomato: "this needs you" (Inbox count, over budget, old imports, lowest forecast point).
   - Green: "this is on track" (paid, on track, net worth went up).
2. **Pastel colour is identity.** Each bucket, account group and Inbox item kind has its own hue everywhere.
   Always a soft fill with a deep glyph.
3. **Everything else is neutral:** text, borders, group labels, navigation.
4. **One page pattern** on every main screen (§5).
5. **Rows, not boxes.** Group rows inside one card with hairlines. Do not put each record in its own box.
6. **Plain words.** Example: "Owed", "Safe to spend until payday", "Give it a job".
7. **Light theme only** in v2.

## 2. Tokens

Put these in `apps/web/src/index.css` as CSS variables. Map them to the shadcn variables in the table.

| Token | Hex | shadcn variable |
|---|---|---|
| bg | `#F4F4F7` | `--background` |
| surface | `#FFFFFF` | `--card`, `--popover` |
| sunken | `#EDEDF2` | `--secondary`, `--accent`, `--muted` |
| ink | `#17171C` | `--foreground`, `--card-foreground` |
| muted | `#5D5C69` | `--muted-foreground` |
| hair | `#E4E4EB` | `--border` |
| control | `#84838F` | `--input` (control borders) |
| primary (iris) | `#4B4BDB` | `--primary`, `--ring` |
| primary-hover | `#3B3BC4` | — |
| primary-fg | `#FFFFFF` | `--primary-foreground` |
| primary-soft | `#ECECFC` | selected nav item, selected choice |
| attn (tomato text) | `#B83A0A` | `--destructive` |
| attn-fill | `#EE6A45` | counts and badges (text on it: ink) |
| attn-soft | `#FDEBE4` | attention tile and pill fill |
| pos (green) | `#2B7A4E` | — |
| pos-soft | `#E4F2E9` | positive pill fill |
| est | `#7C7B88` | estimated forecast line |
| row-hover | `#EFEFFC` | list row hover |
| scrim | `rgb(23 23 28 / .45)` | dialog overlay |
| shadow | `0 1px 2px rgb(0 0 0/.05), 0 16px 40px rgb(23 23 28/.14)` | dialogs, popovers only |

**Identity hues** (soft fill / deep glyph):

| Name | Fill | Glyph |
|---|---|---|
| sky | `#E1F0FA` | `#1F6E9E` |
| mint | `#E2F3E8` | `#25734A` |
| lilac | `#EEE9FD` | `#5B3FC4` |
| butter | `#FDF1CF` | `#8A5B00` |
| pink | `#FCE7F1` | `#A3326B` |
| teal | `#DDF3F1` | `#11706A` |

**Page tints** (summary strip background only): Inbox `#FFEFE7`, Accounts `#FFF6D6`, Buckets `#E6F4EC`, Plan `#EEEEFE`.
Other screens use the surface colour.

**Radius:** cards 16px, inputs 12px, dialogs 20px, icon tiles 10px, buttons and chips fully round (999px).

**Shadows:** only on dialogs, popovers and tooltips. Cards have a 1px `hair` border and no shadow.

## 3. Type

- One family: **Archivo** (variable: width 62–125, weight 400–800).
  Self-host it with `@fontsource-variable/archivo`. The app must not call Google Fonts (privacy, offline use).
- Body: 15px / 1.5, weight 400. Small text: 13–14px. Labels: 14px, weight 600.
- Display (titles, hero numbers): weight 800, `font-stretch: 72%`, line-height 0.9–1.
  - Page title: 40px, uppercase.
  - Dialog title: 30px, uppercase.
  - Hero amount: 60px (44px in a side panel, 48px on a phone).
  - Plan flow amounts: 34px.
- All amounts: `font-variant-numeric: tabular-nums lining-nums`, weight 600.
- Hero amount: the currency symbol at 0.5em, the minor units as superscript at 0.42em. Only in hero amounts.
- Liabilities: a small uppercase "OWED" label (12px, weight 600, muted) before the amount.

## 4. Navigation

- **Desktop:** a 232px sidebar on the left.
  - Brand at the top.
  - Primary: Inbox (with the tomato count), Transactions, Buckets, Plan, Accounts.
  - Group "More": Insights, Recurring.
  - Settings at the bottom.
  - Items are 44px high, radius 10px. Current item: `primary-soft` fill, `primary` text and icon.
- **Phone (width < 768px):** a bottom tab bar: Inbox, Transactions, Buckets, Plan, More.
  More opens a sheet with Accounts, Insights, Recurring and Settings.
- Icons: lucide icons, stroke 1.8, 20px.

## 5. Page pattern

Every main screen has, from top to bottom:

1. **Page header:** a small muted line (date, count or period), the page title, and actions on the right.
2. **Summary strip:** one card with the page tint. It contains the label, the hero amount, one hint line,
   2–3 facts separated by hairlines, and the page illustration (§7) on the right.
3. **Content:** a main list card, and a 336px side panel column on the right.
   Below 1024px the side panel goes below the list.

Inside 32px page padding. 20px gaps between cards.

## 6. Components

Make these as React components in `apps/web/src/components/` on top of shadcn. Change shadcn variants in `components/ui/`
where the look differs (for example, button shape and sizes). Style with Tailwind classes and the tokens. Do not write
global component CSS (AGENTS.md).

| Component | Rules |
|---|---|
| Button | Height ≥ 44px, pill shape, weight 600. Variants: primary (iris), secondary (surface + `control` border), ghost (muted text). One primary button in each decision. |
| Chip | Toggle choice in a row. Pill, 44px, `control` border. Selected: iris fill, white text. Can show a small secondary value. |
| Pill | Status label, 24px high. Neutral, positive (pos-soft/pos) or attention (attn-soft/attn). |
| Count | Tomato badge with ink text. Only for "needs you" counts. |
| Amount | Formats with `Intl` in the browser. Tabular figures. "Owed" label for liabilities. |
| ListCard | One card. Optional group header rows: 12px uppercase label on the left, the group total on the right. Rows: min height 60px (48px for simple lists), hairline between rows, `row-hover` on hover, the name in iris on hover. |
| IconTile | 36–40px tile with an identity hue: soft fill, deep glyph. |
| Progress | 8px bar, round ends, `sunken` track. Fill = the identity glyph colour. Over budget: `attn-soft` track and tomato text, no fill. |
| SplitBar | 8px bar in segments, with a key below (dot + label + amount). |
| SummaryStrip | §5. |
| SidePanel | Card, 18–20px padding, title 16px/700, short text, one action. |
| Dialog | shadcn Dialog. Radius 20px, `scrim` overlay, display title, footer with hairline and buttons on the right. |
| Field | Label above (14px/600), input 44px high, radius 12px, `control` border, 3px iris focus ring. Help text 13px muted below. |
| Choice cards | Radio choices as cards with a title and a one-line description (example: account kind). Selected: iris border and `primary-soft` fill. |
| Reveal | A sub-section that shows only after a choice (example: card details). `bg` fill, hairline border, radius 14px. |
| Disclosure | "More options: …" link-style button that opens optional fields. |

Use shadcn `Table` only for the Transactions list. All other record lists use ListCard rows.

**Actions in lists:**
- Click a row to open it (edit dialog or detail). The whole row is the target.
- Show a maximum of one visible button in a row. Put other actions in a "More" menu
  (shadcn `DropdownMenu`, an icon-only ghost button with `aria-label`).
- Group headers have no visible buttons. Their actions (rename, reorder, delete) go in the group's "More" menu.
- Archive, delete and other destructive actions are neutral menu items. Confirm them with `AlertDialog`.
  Do not use tomato for destructive actions. Tomato means "this needs you" only.
- Show a status only when it is not the default. Example: show an "Essential" badge; do not show "Not essential".
- Do not repeat information that the group already gives. Example: no "Income" label on rows in the Income group.

**Settings:** each area is its own subpage with its own URL: `/settings/groups`, `/settings/categories`,
`/settings/tags`, `/settings/backup`. Desktop: a settings sub-navigation (a short vertical list) on the left of the content.
Phone: `/settings` shows the list of areas; each opens its own page with a back link. Do not put all areas on one page.

**Filters (all list screens):** one compact filter bar, one row high.
- Left: search field (max 320px) with a search icon.
- Then a "Filters" button (secondary). Its count badge shows the number of active filters.
  It opens a `Popover` on desktop and a `Sheet` on the phone with all filter fields and "Apply" / "Clear".
- Right: the sort control (`Select` or `DropdownMenu`).
- Below the bar, only when filters are active: one `Badge` for each active filter ("Account: Visa Card ×")
  and a "Clear all" ghost button. A click on × removes that filter.
- Do not show all filter fields on the page.

**Focus:** one focus style for each control: a 3px iris ring. Do not add an outline as well.
A search field inside a Command or Popover has no ring and no fill; the open popover shows the focus.

**Full height:** the app shell fills the viewport height. The desktop sidebar is full height and stays in place when the page scrolls.

## 6a. Transaction editor

One shared "What is this?" component. The transaction dialog uses it as its core. The Inbox uses the same component inline.

Dialog order, top to bottom:
1. **Money out / Money in** (ToggleGroup) and **Amount** as a positive number. The sign comes from the toggle.
   Never ask the user to type a minus sign. For an imported transaction, show this section as a read-only summary:
   date · account · money out/in amount · bank text.
2. **Account** and **Date** on one row (manual transactions only).
3. **What is this?** (ToggleGroup): Spending or income | Transfer | Split.
   - Spending or income: category Combobox (income categories first for money in, expense first for money out).
   - Transfer: "To account" / "From account" Combobox (spec §7.3: link an existing match or create the mirror).
   - Split: line rows (amount, then category or account) and a live "$X left to assign". Save is disabled until it is 0.
4. **Merchant** Combobox, with the suggestion and its reason.
5. **More details** (Collapsible, closed): notes, tags, bank text, "Cleared" checkbox. No "status" word in the UI.
6. Footer: Save (primary). Delete goes in a More menu with AlertDialog.

The Inbox shows section 3 and the merchant inline, with one primary action (Save) and "More…" that opens the dialog.

## 7. Illustrations

Four small duotone illustrations, one for each tinted summary strip: payday (Inbox), balance scale (Accounts),
jars (Buckets), paycheck split (Plan). Port them from the reference file into React SVG components.
Stroke ink 2.5px, fills from the identity hues and `#F4CD55` as the one warm highlight. They are decoration:
give each one an accessible label, or `aria-hidden` when the text already says the same thing.

## 8. Identity hue assignment

- **Account groups:** Cash & cards = sky, Savings = mint, Investments & property = butter, Loans & mortgage = lilac.
  Group by kind: chequing, cash, credit card → Cash & cards. Savings → Savings. Investment, property, receivable,
  other asset → Investments & property. Mortgage, loan, other liability → Loans & mortgage.
- **Inbox item kinds:** paycheck funding = mint, categorize = sky, recurring change = lilac, transfer = butter,
  over budget = attention (tomato).
- **Buckets:** each bucket has a `color` (one identity hue) and an `icon` (from a fixed lucide set). The user picks them.
  The app suggests a hue in rotation for a new bucket.

## 9. Account kind picker

Show 6 common kinds as choice cards with plain descriptions:
Everyday (chequing), Savings, Credit card, Loan or mortgage, Investment, Something you own (property).
"More kinds" shows Cash, Money lent to someone (receivable), Other asset, Other debt.
"Loan or mortgage" then asks "Is it a mortgage?".

## 10. Accessibility

- Text contrast 4.5:1 (3:1 for 24px and larger).
- Touch targets ≥ 44px.
- Focus: 3px iris outline, 2px offset.
- Colours that must be told apart also differ in lightness. Never colour alone: an over-budget row also says "Over by $42.00".
