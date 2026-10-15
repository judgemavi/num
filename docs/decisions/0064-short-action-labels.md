# 0064 — Short action labels

Status: approved (owner, 2026-10-15)

## Context

1. Many buttons repeat the name of the record that the dialog, card, page or row already shows. Examples: "Save
   category" in the "Edit category" dialog, "Add as commitment" on a Detected row, "Add bank balance" in the
   "Bank balance" card.
2. The repeated noun makes the button wide. In the 336px side column, the Detected row did not fit.

## Decision

1. A button uses only the verb when its context gives the record. The context is the dialog title, the card title,
   the page title or the row.
   - Form submit: "Save" or "Add".
   - Confirmation: "Delete", "Archive", "Restore", "Remove", "Undo".
   - Page header create button: "New".
   - Card action: "Add", "Edit".
2. A label keeps its noun when the verb alone is not clear:
   - A row menu item that opens a different record (example: "Add bank balance" in the menu of an account,
     "Link a transaction").
   - A link to a different screen (example: "Imports", "Back to imports").
   - Two choices for the same row (example: "Use <payee>" and "Add as new").
   - A source or a destination that the person must know (example: "Fund from Unassigned").
3. On a Detected suggestion, the button is "Add" (amends spec §7.4 and decision 0062 item 12). The amount sign
   tells if the schedule is a commitment or an income. The form title tells the same.
4. In the Upcoming row menu, "Restore this occurrence" is "Restore" (amends decision 0055 item 2).

## Consequences

- Buttons are shorter and fit in narrow columns.
- New UI follows item 1 and item 2.
