# Num — Design (direction "Signal")

Writing standard: ASD-STE100.

Status: **approved** (decision 0009). This file is the source of truth for the look of the web app.
The visual reference is `docs/design/signal-reference.html`. Open it in a browser. It uses synthetic data.

## 1. Principles

1. **Colour is a signal.** Strong colour tells the user one of three things:
   - Iris: "you can do this" (main buttons, selection, progress, links).
   - Tomato: "this needs you" (needs-review count, over budget, old imports, lowest forecast point).
   - Green: "this is on track" (paid, on track, net worth went up).
2. **Pastel colour is identity.** Each bucket, account group and Home item kind has its own hue everywhere.
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
| shadow | `0 1px 2px rgb(0 0 0/.05), 0 16px 40px rgb(23 23 28/.14)` | dialogs, popovers, the action bar |

**Identity hues** (soft fill / deep glyph):

| Name | Fill | Glyph |
|---|---|---|
| sky | `#E1F0FA` | `#1F6E9E` |
| mint | `#E2F3E8` | `#25734A` |
| lilac | `#EEE9FD` | `#5B3FC4` |
| butter | `#FDF1CF` | `#8A5B00` |
| pink | `#FCE7F1` | `#A3326B` |
| teal | `#DDF3F1` | `#11706A` |

**Page tints** (summary strip background only): Home `#FFEFE7`, Accounts `#FFF6D6`, Buckets `#E6F4EC`, Insights `#EEEEFE`.
Other screens use the surface colour.

**Radius:** cards 16px, inputs 12px, dialogs 20px, icon tiles 10px, buttons and chips fully round (999px).

**Shadows:** only on dialogs, popovers, tooltips and the action bar. Cards have a 1px `hair` border and no shadow.

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
- Hero amount: the currency symbol at 0.5em, the fraction digits as superscript at 0.42em. Only in hero amounts.
- Liabilities: a small uppercase "OWED" label (12px, weight 600, muted) before the amount.

## 4. Navigation

- **Desktop:** a 232px sidebar on the left. The user can collapse it to icons (shadcn Sidebar `collapsible="icon"`);
  the app remembers the choice.
  - Brand at the top.
  - Primary: Home (with the tomato needs-review count), Transactions, Buckets, Accounts.
  - Group "More": Insights, Recurring.
  - Settings at the bottom.
  - Items are 44px high, radius 10px. Current item: `primary-soft` fill, `primary` text and icon.
- **Phone (width < 768px):** a bottom tab bar: Home, Transactions, Buckets, Accounts, More.
  More opens a sheet with Insights, Recurring and Settings.
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
| ActionBar | Actions for the selected rows of a table (decision 0051). A floating `ink` pill with white text, bottom centre of the screen, with the dialog shadow. Left: "N selected". Then 44px buttons: an outline button on the dark fill (white text, white border at low opacity), one primary (iris) button, and a ghost "Clear". It shows only while one or more rows are selected. The page gets space at its end, thus the bar does not cover the last rows and the pager. |

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

**Messages after a write (decision 0042):** shadcn `Sonner` toasts, one `Toaster` at the app root, bottom centre.
- A write that has no form (a row action, a one-click answer, archive, undo, cover) shows an error toast when it
  fails. Do not show the error of such a write in the page.
- A form shows the error of its write in the form (`FormError`). It shows no toast.
- A write that can be undone with an existing route shows a success toast with an "Undo" action. Other writes show no
  success toast, except Approve and the bulk editor (decision 0051), which show the number of approved or changed
  transactions and the number of skipped rows: "10 changed · 2 skipped".

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

**Charts (decision 0030):** use only the chart tokens `chart-1` to `chart-5`, `est` and `attn`.
- Insights timeline: income bars `chart-3`, spending bars `chart-2`, balance line `chart-5`.
  Forecast bars and the balance forecast line use the same colour at a lower opacity (lighter tone).
  When the forecast ends inside a month, the forecast part of that bar also has a dashed outline in the same colour.
  The known-only forecast line is `est`, dashed. The lowest forecast point is `attn`. The `asOf` marker is `muted`, dashed.
- Spending donut: slices take `chart-1` to `chart-5` in order. After 5 slices, the colours repeat at a lower opacity.
  "Uncategorized" is `est`. The list under the donut shows the same colour as a dot in each row.

## 6a. Transaction editor

The transaction editor is one shared editor (§6b). Home, Transactions, import detail and Recurring open it.

Order, top to bottom:
1. **Money out / Money in** (ToggleGroup) and **Amount** as a positive number. The sign comes from the toggle.
   Never ask the user to type a minus sign. For an imported transaction, show this section as a read-only summary:
   date · account · money out/in amount.
2. **Account** and **Date** on one row (manual transactions only).
3. **Description** (text field). For an imported transaction it is disabled, with the hint "From the bank import. It
   does not change." Never say "bank text" in the UI.
4. **What is this?** (ToggleGroup). The choices follow the direction (spec §7.3):
   - Money out: Spending · Transfer · Loan payment. Money in: Income · Refund · Transfer.
   - Spending / Refund: expense categories only. Income: income categories only.
   - Transfer: "To account" / "From account" Combobox (link an existing match or create the mirror). No merchant.
   - Loan payment (decision 0053): "Loan account" Combobox (mortgage and loan accounts that are not archived),
     "Interest" (money field), "Principal" (read-only: the amount minus the interest) and "Interest category"
     (Combobox of expense categories). For a mortgage with terms, Interest starts with the interest of the schedule,
     with the hint "From the payment schedule." Interest category starts with the category of the terms, else the
     category of the last loan payment to that account. No merchant.
5. **Merchant** Combobox, with the suggestion and its level. Hidden for Transfer and Loan payment.
6. **Tags**. All fields show; the editor has no collapsed section. There is no "Cleared" control and no "status" word
   in the UI: only the app sets the status (decision 0050).
7. Footer: Save (primary). Delete goes in a More menu (shared confirm).
   There is one primary button, Save. When the transaction needs review, Save is the user's answer: with no change it
   confirms the automatic label or applies the suggestion shown in the form; with a change it saves and confirms.
   A question is a field filled with the proposed answer (decision 0047): Transfer to the other account of a pair,
   the candidate purchases first in "Refund of…", and "Payment for…" (Combobox, starts empty) for a recurring payment.
   The header shows only the level; no action buttons.

Needs review is its own route with the same table (decision 0047): `/transactions` shows all transactions and
`/transactions/review` shows only the transactions that need review. There is no second list component. Both pages show
two tabs (links) in the page header: "All" and "Needs review · N". A tab link does not keep the search and the filters.
Columns: a checkbox, Date, Account, Payee, Category, Amount, Status (and Balance when one account is shown).
The checkbox column (decision 0051) shows only on these two pages, not on the page of an account. A click on the
checkbox selects the row; a click on another part of the row opens the editor. Shift and click selects a range. The
header checkbox selects all rows of the page. The checkbox of a loan payment is disabled, with the Tooltip "Loan
payments are changed one at a time." (decision 0053) With a selection, the ActionBar (§6) shows "N selected", "Edit…" (primary) and "Clear". On `/transactions/review` it
also shows "Approve · N" (outline) before "Edit…". Approve has no confirm.
The Category column shows the category, "Transfer to <account>", "Loan payment", or "Uncategorized", and the merchant
below it.
The Amount cell shows only the exceptions: a lock icon for a reconciled row (Tooltip: "Checked against your balance on <date>")
and "Pending" for an open row (entered by hand in an account that gets imports, not yet on a statement; decision 0052).
A cleared row shows nothing.
The Status column (right-most) shows a Badge only when the row needs review: the level (Sure, Likely, Maybe, never a
percentage) for a row with a suggestion or an automatic label, and "Needs review" for a row with a question or no
suggestion. On `/transactions/review` the column is "Confidence" (decision 0048): the level, "Question" for a question,
and nothing for a row with no suggestion. The Confidence header is a sort button, as Date, Payee and Amount are
(decision 0049). There, the Category column shows the proposed label and merchant of a
suggestion (the same text as a stored label; the level tells that it is a proposal) and "Transfer to <account>" for a
possible transfer. A row has no buttons. The whole row opens the editor. No dismiss, no queue mode.
The table has no group rows. The page header of `/transactions/review` has no "Approve all" buttons.

**Bulk editor (decision 0051).** "Edit…" in the ActionBar opens it through `openEditor` (§6b). It is not in the URL.
- Header: "Edit N transactions", and below it the account (or "N accounts"), the date range and the total.
- Fields, each starts as "No change": **What is this?** (ToggleGroup: No change, the category choices of the direction,
  Transfer; Transfer only when all rows are in one account, with an "Other account" Combobox; money out and money in
  together: only No change and Transfer), **Merchant** (No change or Change; Change shows the merchant Combobox with
  "No merchant"; hidden for Transfer), **Add tags** (the tag picker) and **Remove tags** (a toggle for each tag of the
  selected rows).
- Below the fields: a short list of the selected rows (date, payee, current category, amount).
- Footer: Cancel and "Save N transactions" (primary). No confirm. The toast shows the counts.

## 6b. Shared editors and the dialog host

- One editor component for each entity: Transaction, Account, Category, Group, Tag, Merchant, Bucket, Recurring.
  The bulk editor of selected transactions (§6a) is a separate editor; the transaction editor has no group mode.
  Each editor is built from one form component. The same form is used in a dialog and inline (create on the spot).
  The same editor creates and edits, on every screen.
- One dialog host at the app root. Screens call `openEditor(kind, props)`. Screens do not render their own dialogs.
  Only the open editor exists in the page.
- An editor loads its own data when it opens (by ID, through the query cache). List rows carry only what they show.
- Editors do not stack. Only one top-level editor is open at a time (decision 0018).
- One shared `confirm()` (AlertDialog) for every confirmation.
- The URL shows the open single-record editor (`?edit=transaction:<id>`). Back closes it.

**Create on the spot:** the first option of every picker of user-managed things (categories, groups, tags,
merchants, accounts) is "+ Create new <thing>". Choosing it expands that entity's form inline below the picker, prefilled
with the typed text. Save creates, selects and collapses; Cancel collapses. Inline forms nest at most two levels (category
form → "+ Create new group"). An archived match shows "Restore 'X'".

**Account editor, mortgage (decision 0027):** when the kind is mortgage, the Account form has a "Mortgage terms" section
under the amount owed. It is open by default, with the help line "Add the terms to see the payment schedule and the
interest and principal of each payment." The opening date has the help line from decision 0027, and the form shows the
first payment warning from decision 0027. There is no separate mortgage terms editor.

**Mortgage schedule:** one ListCard for each year. Each row shows the date, the payment, the interest, the principal and
the balance after the payment. A past row also shows the actual payment or "No payment". Past years are collapsed
(`Collapsible`). On a phone, interest and principal go on the second line of the row.

## 7. Illustrations

Four small duotone illustrations, one for each tinted summary strip: payday (Home), balance scale (Accounts),
jars (Buckets), paycheck split (Insights). Port them from the reference file into React SVG components.
Stroke ink 2.5px, fills from the identity hues and `#F4CD55` as the one warm highlight. They are decoration:
give each one an accessible label, or `aria-hidden` when the text already says the same thing.

## 8. Identity hue assignment

- **Account groups:** Cash & cards = sky, Savings = mint, Investments & property = butter, Loans & mortgage = lilac.
  Group by kind: chequing, cash, credit card → Cash & cards. Savings → Savings. Investment, property, receivable,
  other asset → Investments & property. Mortgage, loan, other liability → Loans & mortgage.
- **Review and Home item kinds:** paycheck funding = mint, categorize = sky, recurring change = lilac, transfer = butter,
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
