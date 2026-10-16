# Num — Design (direction "Signal")

Writing standard: ASD-STE100.

Status: **approved**. This file is the source of truth for the look of the web app.

## 1. Principles

1. **Colour is a signal.** Strong colour tells the user one of three things:
   - Iris: "you can do this" (main buttons, selection, progress, links).
   - Tomato: "this needs you" (needs-review count, over budget, old imports).
   - Green: "this is on track" (paid, on track).
2. **Pastel colour is identity.** Each bucket, category group, account group and Home item kind has its own hue everywhere.
   Always a soft fill with a deep glyph.
3. **Everything else is neutral:** text, borders, group labels, navigation.
4. **One page pattern** on every main screen (§5).
5. **Rows, not boxes.** Group rows inside one card with hairlines. Do not put each record in its own box.
6. **Plain words.** Example: "Owed", "Available to spend", "Set aside for bills".
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
| est | `#7C7B88` | neutral chart colour (Uncategorized) |
| no-group | `#A9A8B3` | neutral chart colour (No group) |
| debt-payments | `#8C6D46` | fixed chart colour (Debt payments) |
| row-hover | `#EFEFFC` | list row hover |
| scrim | `rgb(23 23 28 / .45)` | dialog overlay |
| shadow | `0 1px 2px rgb(0 0 0/.05), 0 16px 40px rgb(23 23 28/.14)` | dialogs, popovers, the action bar |

**Identity palette** (fill, glyph, chart and category shades, darkest first):

| Name | Fill | Glyph | Chart | Shades |
|---|---|---|---|---|
| sky | `#DCF4FF` | `#005E8F` | `#248FCC` | `#006AA2` `#0C82BF` `#4BA1D9` `#78BDEC` `#A3D5F8` |
| ocean | `#E5F0FF` | `#3B5495` | `#6182D4` | `#425FA9` `#5676C7` `#7696E1` `#97B3F3` `#B8CDFE` |
| lilac | `#F0ECFF` | `#5A4A90` | `#8976CD` | `#6653A3` `#7D6AC0` `#9A8ADA` `#B5A9EE` `#CEC6F9` |
| plum | `#FBE9FF` | `#73417E` | `#A86AB6` | `#82498E` `#9C5EAA` `#B880C5` `#D0A0DB` `#E3BFEB` |
| pink | `#FFE7F3` | `#843B61` | `#BF6291` | `#95416D` `#B25785` `#CE79A2` `#E49BBD` `#F3BBD4` |
| amber | `#FFEDD7` | `#7E4B00` | `#B77610` | `#8F5400` `#AA6A00` `#C68A3E` `#DCA96D` `#EDC69B` |
| butter | `#F7F1D6` | `#6B5600` | `#9E8500` | `#796100` `#917900` `#AE9837` `#C7B46A` `#DBCE99` |
| olive | `#ECF4DB` | `#4E6103` | `#79922B` | `#586D00` `#6E861B` `#8CA44C` `#AABE77` `#C6D6A2` |
| mint | `#E0F7E4` | `#1D6835` | `#429C5A` | `#1D763B` `#348F4F` `#5FAC71` `#86C693` `#ADDCB5` |
| teal | `#D8F8F1` | `#006B5A` | `#009F89` | `#007966` `#00927D` `#21AF9B` `#66C9B6` `#99DECF` |
| cyan | `#D6F7FD` | `#00677A` | `#009AB1` | `#00748A` `#008DA4` `#05ABC0` `#5FC5D6` `#96DBE8` |
| slate | `#EAF1F8` | `#4C5A69` | `#77889B` | `#576573` `#6D7C8C` `#8C9AA9` `#AAB6C2` `#C6CFD8` |

**Page tints** (summary strip background only): Home `#FFEFE7`, Accounts `#FFF6D6`, Buckets `#E6F4EC`.
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
- All amounts: `font-variant-numeric: tabular-nums lining-nums`, weight 600.
- Hero amount: the currency symbol at 0.5em, the fraction digits as superscript at 0.42em. Only in hero amounts.
- Liabilities: a small uppercase "OWED" label (12px, weight 600, muted) before the amount.

## 4. Navigation

- **Desktop:** a 232px sidebar on the left. The user can collapse it to icons (shadcn Sidebar `collapsible="icon"`);
  the app remembers the choice.
  - Brand at the top.
  - Primary: Home (with the tomato needs-review count), Transactions, Buckets, Accounts.
  - Settings at the bottom.
  - Items are 44px high, radius 10px. Current item: `primary-soft` fill, `primary` text and icon.
- **Phone (width < 768px):** a bottom tab bar: Home, Transactions, Buckets, Accounts, Settings. There is no "More"
  sheet.
- Icons: lucide icons, stroke 1.8, 20px.

## 5. Page pattern

Every main screen has, from top to bottom:

1. **Page header:** a small muted line (date, count or period), the page title, and actions on the right.
2. **Summary strip:** one card with the page tint. It contains the label, the hero amount, 2–3 facts separated by
   hairlines, and the page illustration (§7) on the right. It has no hint line that repeats a label or a fact. A hint
   line shows only a fact that needs the user (example: the difference of an account that does not match its bank).
   On a phone, the illustration is about 88px, in the top right corner next to the hero amount.
   A screen without a page tint (the account page) uses the surface colour and has no illustration.
   Home: below the hero, one row with three small amounts (18px, weight 600): "In your accounts" − "Saving buckets" −
   "Set aside for bills".
   Transactions has no summary strip. The count of the transactions is the small line of its page header.
   On a phone the facts have no hairlines. They go below the hero amount, side by side, and wrap to a new line.
   On a phone the three amounts of Home are a sum in two columns: the label on the left and the amount on the right,
   one line for each amount. The minus sign is at the start of the label ("− Saving buckets"), not after an amount.
   The lines under the hero amount use the full width of the strip.
3. **Content:** a main list card, and a 336px side panel column on the right.
   Below 1280px the side panel goes below the list. Thus the rows of the list are not too narrow. The filter bar of the
   list is directly above the list card, below the summary strip.

Inside 32px page padding. 20px gaps between cards.

**Width:** no page or record list scrolls sideways. The import column-map preview can scroll inside its own box.
A row follows the width of its card. A narrow card shows the narrow row, on a phone, a tablet or a half-screen window.
A name, a date and an amount never wrap one word on each line: the name truncates with an ellipsis, and a date and an
amount do not wrap.

## 6. Components

Make these as React components in `apps/web/src/components/` on top of shadcn. Change shadcn variants in `components/ui/`
where the look differs (for example, button shape and sizes). Style with Tailwind classes and the tokens. Do not write
global component CSS (AGENTS.md).

| Component | Rules |
|---|---|
| Button | Height ≥ 44px, pill shape, weight 600. Variants: primary (iris), secondary (surface + `control` border), ghost (muted text). One primary button in each decision. |
| Chip | Toggle choice in a row. It is the shadcn `ToggleGroup` item (and `Toggle`). Separate pills with a gap, never joined segments. Pill, 44px, `control` border. Selected: iris fill, white text, weight 600. Can show a small secondary value. The colour and icon pickers of a bucket use the same `ToggleGroup` with swatches. |
| Pill | Status label, 24px high. Neutral, positive (pos-soft/pos), attention (attn-soft/attn), or butter (butter fill/glyph, rising trend icon) for a spending increase. |
| Count | Tomato badge with ink text. Only for "needs you" counts. |
| Amount | Formats with `Intl` in the browser. Tabular figures. "Owed" label for liabilities. 16px/600. In a secondary line (13px, normal weight) it has the size and the weight of the line. |
| ListCard | One card. Each row is a shadcn `Item`. A row that opens has one target that covers the row. Rows: min height 60px (48px simple lists, 36px dense lists; 44px dense on a touch screen), hairline between rows, `row-hover` on hover, the name in iris on hover. Group header rows: 12px uppercase label left, group total right; never doubled lines. All lists use one row style: the name column is flexible, the columns after it have fixed widths and line up. Long secondary text goes below the name. The More menu (⋯) is an icon-only ghost button at the end of line 1, after the amount; it adds no height and does not cover the amount. A row with no menu in a list with menus keeps the empty space. In a narrow row, the amount goes on line 1 after the name, and a bar takes a full line under the text. The name truncates first; a date and an amount never wrap. Bucket rows: line 1 icon, name, balance; line 2 muted detail (a bill: "Due <date> · of <amount>" and the short or fill text), breaking only after a "·"; then a thin full-width bar (not for an income). A dense list has a dot, the name and the amount on one line. |
| IconTile | 36–40px tile with an identity hue: soft fill, deep glyph. It is the media of the row (`ItemMedia`). |
| Empty | The empty state of a list: shadcn `Empty` with one quiet line (the title, 15px, muted). No icon, no description, no large block. |
| Progress | 8px bar, round ends, `sunken` track. Fill = the identity glyph colour. Over budget: `attn-soft` track and tomato text, no fill. |
| SummaryStrip | §5. |
| SidePanel | Card, 18–20px padding, title 16px/700, short text, one action. |
| Dialog | shadcn Dialog. Radius 20px, `scrim` overlay, display title, footer with hairline and buttons on the right. A dialog has a description under the title only when it gives a fact that the user needs (example: "This does not move money between accounts."). A description does not repeat or explain the title. |
| Field | Label above (14px/600), input 44px high, radius 12px, `control` border, 3px iris focus ring. Help text 13px muted below. A text input, a `Select` trigger, a Combobox trigger, a date trigger and the search field have one look: the same height, radius, border, 16px text (a phone does not zoom in) and focus ring. A trigger shows a chevron at the end (a date trigger shows a calendar). There is one Combobox component (Command + Popover) for every long list of options. |
| Choice cards | Radio choices as cards with a title and a one-line description (example: account kind). Selected: iris border and `primary-soft` fill. |
| Reveal | A sub-section that shows only after a choice (example: card details). `bg` fill, hairline border, radius 14px. |
| ActionBar | Actions for the selected rows of a table. A floating `ink` pill with white text, bottom centre of the screen, with the dialog shadow. Left: "N selected". Then 44px buttons: an outline button on the dark fill (white text, white border at low opacity), one primary (iris) button, and a ghost "Clear". It shows only while one or more rows are selected. The page gets space at its end, thus the bar does not cover the last rows and the pager. |

Use shadcn `Table` only for the Transactions list and the column-map preview of an import. All other record lists use
ListCard rows.

**Actions in lists:**
- Click a row to open it (edit dialog or detail). The whole row is the target.
- Show a maximum of one visible button in a row. Put other actions in a "More" menu
  (shadcn `DropdownMenu`, an icon-only ghost button with `aria-label`).
- Group headers have no visible buttons. Their actions (rename, delete) go in the group's "More" menu.
- Archive, delete and other destructive actions are neutral menu items. Confirm them with `AlertDialog`.
  Do not use tomato for destructive actions. Tomato means "this needs you" only.
- Show a status only when it is not the default. Example: show a "Paused" badge on a bucket; do not show "Active".
- Do not repeat information that the group already gives. Example: no "Income" label on rows in the Income group.
- A "New" button in a page header has a plus icon before the word, on every page.
- A button uses only the verb when the dialog, card, page or row already names the record: "Save", "Add", "New",
  "Delete". Keep the noun only when the verb alone is not clear: a menu item that opens a different record ("Add bank
  balance"), a link to a different screen ("Imports"), two choices for the same row, or a source or destination that
  the person must know ("Fund from Unassigned").

**Messages after a write:** shadcn `Sonner` toasts, one `Toaster` at the app root, bottom centre.
- A write that has no form (a row action, a one-click answer, archive, undo) shows an error toast when it
  fails. Do not show the error of such a write in the page.
- A form shows the error of its write in the form (`FormError`). It shows no toast.
- A write that can be undone with an existing route shows a success toast with an "Undo" action. Other writes show no
  success toast, except Approve and the bulk editor, which show the number of approved or changed
  transactions and the number of skipped rows: "10 changed · 2 skipped".

**Settings:** each area is its own subpage with its own URL: `/settings/groups`, `/settings/categories`,
`/settings/tags`, `/settings/merchants`, `/settings/currency`, `/settings/ai`, `/settings/backup`. Desktop: a settings sub-navigation (a short vertical list) on the left of the content.
It uses the same shadcn Sidebar menu items as the main sidebar (§4), thus the two look the same.
Phone: `/settings` shows the list of areas; each opens its own page with a back link. Do not put all areas on one page.
The record lists of Settings are simple lists (48px rows).

**Back link:** a page under another page (an account page, a settings area on a phone) has a back link above the
page header: a muted chevron and the name of the parent page.

**Filters (all list screens):** one compact filter bar, one row high.
- Left: search field (max 320px) with a search icon.
- Then a "Filters" button (secondary). Its count badge shows the number of active filters.
  It opens a `Popover` on desktop and a `Sheet` on the phone with all filter fields and "Apply" / "Clear".
  The fields are in one `FieldGroup`. Each field (the label and its control) is one `Field`, with a 20px gap between
  the fields.
- Then, only when filters are active: a "Clear" ghost button. A click removes all filters.
- Right: the sort control (`Select` or `DropdownMenu`).
- On the phone the bar has two lines. Line 1: the search field in the full width. Line 2: "Filters", "Clear" (only when
  filters are active) and the sort control. The sort control fills the rest of the line, and its text truncates with
  an ellipsis. A list with no search field has only line 2. On desktop the bar is one row.
- Below the bar, only when filters are active: one `Badge` for each active filter ("Account: Visa Card ×").
  The row has only the badges. A click on × removes that filter.
- Do not show all filter fields on the page.

**Focus:** one focus style for each control: a 3px iris ring (`ring`, full opacity). Do not add an outline as well.
A search field inside a Command or Popover has no ring and no fill; the open popover shows the focus.

**Full height:** the app shell fills the viewport height. The desktop sidebar is full height and stays in place when the page scrolls.

**Charts:** use the identity palette and the fixed chart colours below.
- Spending timeline (Home): income bars use teal shade 3 (`#21AF9B`), spending bars use ocean shade 1 (`#425FA9`).
  Forecast bars use the same colour at a lower opacity (lighter tone).
  When the forecast ends inside a month, the forecast part of that bar also has a dashed outline in the same colour.
  The `asOf` marker is `muted`, dashed.
- Spending donut: two rings. The inner ring is the groups. Each slice uses its group's chart colour at full opacity.
  The outer ring is the categories. Each uses its group's shades in order, darkest first, repeating after five.
  "No group" uses `no-group`; its categories mix that grey with 5%, 10%, 15%, 20% and 25% white, then repeat.
  "Debt payments" uses `debt-payments`; its accounts mix that colour with 5%, 10%, 15%, 20% and 25% white, then repeat.
  "Uncategorized" is `est`. Keep white separators between slices. The list dots use the same colours as the slices.
  A slice has a hover tooltip in the style of the timeline tooltip.

## 6a. Transaction editor

The transaction editor is one shared editor (§6b). Home, Transactions, import detail and Buckets open it.

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
   - Loan payment: "Loan account" Combobox (mortgage and loan accounts that are not archived),
     "Interest" (money field), "Principal" (read-only: the amount minus the interest) and "Interest category"
     (Combobox of expense categories). For a mortgage with terms, Interest starts with the interest of the schedule,
     with the hint "From the payment schedule." Interest category starts with the category of the terms, else the
     category of the last loan payment to that account. No merchant.
5. **Merchant** Combobox, with the suggestion and its level. Hidden for Transfer and Loan payment.
6. **Tags**. All fields show; the editor has no collapsed section. There is no "Cleared" control and no "status" word
   in the UI: only the app sets the status.
7. Footer: Save (primary). Delete goes in a More menu (shared confirm).
   There is one primary button, Save. When the transaction needs review, Save is the user's answer: with no change it
   confirms the automatic label or applies the suggestion shown in the form; with a change it saves and confirms.
   A question is a field filled with the proposed answer: Transfer to the other account of a pair,
   the candidate purchases first in "Refund of…", and "Payment for…" (Combobox, starts empty) for a recurring payment.
   The header shows only the level; no action buttons.

Needs review is its own route with the same table: `/transactions` shows all transactions and
`/transactions/review` shows only the transactions that need review. There is no second list component. Both pages show
two tabs (links) in the page header: "All" and "Needs review · N" (with the count, also when it is 0). The tabs are 44px
high. The text of a tab that is not selected is muted. The selected tab has an iris line under it. With no row, the
review page shows its empty state. A tab link does not keep the search and the filters.
Columns: a checkbox, Date, Account, Payee, Category, Amount (and Balance when one account is shown). There is no
Status column.
All column headers have one style: 12px, weight 700, uppercase, muted. A sortable header is a button with the same text.
The table never scrolls sideways.
- A narrow table shows the checkbox and one cell with two lines. Line 1: the payee and the amount. Line 2 (muted): the
  date · the category or transfer text, "Pending" and the review text. The header keeps the sort buttons Payee, Date and
  Amount.
- A wider table shows the columns. The Account column shows only when there is room.
- The sorted header shows an up or down arrow.
The checkbox column shows only on these two pages, not on the page of an account. A click on the
checkbox selects the row; a click on another part of the row opens the editor. Shift and click selects a range. The
header checkbox selects all rows of the page. The checkbox of a loan payment is disabled, with the Tooltip "Loan
payments are changed one at a time." With a selection, the ActionBar (§6) shows "N selected", "Edit…" (primary) and "Clear". On `/transactions/review` it
also shows "Approve · N" (outline) before "Edit…". Approve has no confirm.
The Category column shows the category, "Transfer to <account>" (money out) or "Transfer from <account>" (money in), "Loan payment", or "Uncategorized", and the merchant
below it.
The Amount cell shows only the exception: "Pending" for an open row (entered by hand in an account that gets imports, not yet on a statement).
A cleared row shows nothing.
On `/transactions` and on the page of an account, a row that needs review has a 3px `attn` stripe at its left edge.
`/transactions/review` has no stripe. The review text (spec §7.3) is a pill after the category.
There, the Category column shows the proposed label and merchant of a
suggestion (the same text as a stored label; the level tells that it is a proposal) and "Transfer to <account>" or "Transfer from <account>" for a
possible transfer. A row has no buttons. The whole row opens the editor. No dismiss, no queue mode.
The table has no group rows. The page header of `/transactions/review` has no "Approve all" buttons.

**Bulk editor.** "Edit…" in the ActionBar opens it through `openEditor` (§6b). It is not in the URL.
- Header: "Edit N transactions", and below it the account (or "N accounts"), the date range and the total.
- Fields, each starts as "No change": **What is this?** (ToggleGroup: No change, the category choices of the direction,
  Transfer; Transfer only when all rows are in one account, with an "Other account" Combobox; money out and money in
  together: only No change and Transfer), **Merchant** (No change or Change; Change shows the merchant Combobox with
  "No merchant"; hidden for Transfer), **Add tags** (the tag picker) and **Remove tags** (a toggle for each tag of the
  selected rows).
- Below the fields: a short list of the selected rows (date, payee, current category, amount).
- Footer: Cancel and "Save N transactions" (primary). No confirm. The toast shows the counts.

## 6b. Shared editors and the dialog host

- One editor component for each entity: Transaction, Account, Category, Group, Tag, Merchant, Bucket, Commitment, Income.
  The bulk editor of selected transactions (§6a) is a separate editor; the transaction editor has no group mode.
  Each editor is built from one form component. The same form is used in a dialog and inline (create on the spot).
  The same editor creates and edits, on every screen.
- One dialog host at the app root. Screens call `openEditor(kind, props)`. Screens do not render their own dialogs.
  Only the open editor exists in the page.
- An editor loads its own data when it opens (by ID, through the query cache). List rows carry only what they show.
- Editors do not stack. Only one top-level editor is open at a time.
- One shared `confirm()` (AlertDialog) for every confirmation.
- Editors show all their fields. Do not hide a control behind a disclosure. Put related fields together, and put two
  short fields in one row (two columns from `sm`).
- The URL shows the open single-record editor (`?edit=transaction:<id>`). Back closes it.

**Create on the spot:** the first option of every picker of user-managed things (categories, groups, tags,
merchants, accounts) is "+ Create new <thing>". Choosing it expands that entity's form inline below the picker, prefilled
with the typed text. Save creates, selects and collapses; Cancel collapses. Inline forms nest at most two levels (category
form → "+ Create new group"). An archived match shows "Restore 'X'".

**Account editor, mortgage:** when the kind is mortgage, the Account form has a "Mortgage terms" section
under the amount owed. It always shows, with the help line "Add the terms to see the payment schedule and the
interest and principal of each payment." The opening date has the help line "Use the date of the last payment before the first payment in Num. Use the amount
owed after that payment." When the first payment date is not one payment period after the opening date, the form
shows the warning "The first payment is not one payment period after the opening date. The first payment gets more
or less interest than a regular payment." The person can save. There is no separate mortgage terms editor.

**Mortgage schedule:** one ListCard shows one year. A year control (`Select`) is next to the title. It starts at the
current year. Each row shows the date, the payment, the interest, the principal and the balance after the payment. A
past row also shows the actual payment or "No payment". On a phone, interest and principal go on the second line of the row.

## 7. Illustrations

Three small duotone illustrations, one for each tinted summary strip: wallet and calendar (Home), balance scale
(Accounts), jars (Buckets). Port them from the reference file into React SVG components.
Stroke ink 2.5px, fills from the identity hues and `#F4CD55` as the one warm highlight. They are decoration:
give each one an accessible label, or `aria-hidden` when the text already says the same thing.

## 8. Identity colour assignment

- **Account groups:** Cash = sky, Assets = butter, Liabilities = lilac.
  Group by kind: chequing, savings, cash → Cash. Investment, property, receivable, other asset → Assets.
  Credit card, mortgage, loan, other liability → Liabilities. The Liabilities group total has the "OWED" label (§3).
- **Review and Home item kinds:** categorize and review = sky, recurring change and missed payment = lilac,
  transfer = butter, imports = teal, goals and savings rate = mint, emergency fund and savings used = pink,
  over budget, a short bill, a short pool and an account that does not match its bank = attention (tomato).

**Home "Needs you":** one ListCard with a tomato count badge. Each row: an IconTile with the hue of its kind, a title,
one short detail line and a chevron. The whole row opens the screen of its fix. Home is read-only: a row has no buttons
and no menu. With no item, the "Needs you" section does not show. A section title "Spending" (display font, uppercase) starts the Spending
part of Home.
- **Buckets and category groups:** each has a `color` from the identity palette. The user picks it. A bucket also has an
  `icon` from a fixed lucide set. A new bucket or group gets the next colour in palette order, from the number of
  stored buckets or groups. Setup gives the default groups colours in list order with the same rotation.

## 9. Account kind picker

Show all kinds as choice cards with plain descriptions:
Everyday (chequing), Savings, Credit card, Loan or mortgage, Investment, Something you own (property), Cash, Money lent
to someone (receivable), Other asset, Other debt.
"Loan or mortgage" then asks "Is it a mortgage?".

## 10. Accessibility

- Text contrast 4.5:1 (3:1 for 24px and larger).
- Touch targets ≥ 44px.
- Focus: 3px iris outline, 2px offset.
- Colours that must be told apart also differ in lightness. Never colour alone: an over-budget row also says "Over by $42.00".
