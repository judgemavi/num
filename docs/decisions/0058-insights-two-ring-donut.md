# 0058 — Insights: a two-ring spending donut

Status: approved (owner, 2026-10-14)

## Context

1. Decision 0030 gives a donut with two levels. The user selects a group, and the donut shows its categories.
   A "Back" control returns to the groups. The user cannot see groups and categories together.
2. The list of spending by merchant has little use next to the donut. The owner asks to remove it.

## Decision

1. **Two rings (amends 0030 items 8 and 9).** The donut has two rings. The inner ring is the spending by group.
   The outer ring is the spending by category. There is no level switch and no "Back" control.
2. **Alignment.** A category arc is inside the arc of its group and starts at the same angle. Groups are largest first.
   Categories are largest first inside their group. "No group" and "Uncategorized" are slices of the inner ring, as in
   decision 0030. "Uncategorized" has no category. Its outer ring span is empty.
3. **Refunds (keeps 0030 item 10).** A group or a category with spending of zero or less is not a slice.
   It stays in the list. A group with a refund can have positive categories that add up to more than the net
   spending of the group. Then the category arcs share the arc of the group in proportion to the positive amounts
   of the categories. The percentages in the tooltip follow the arcs.
4. **Select (amends 0030 items 9 and 11).**
   - A click on a group slice selects the group (`group` in the URL). The other slices are dimmer. The list shows
     only that group with its categories. A second click clears the selection.
   - A click on a category slice selects the category (`category` in the URL), as in decision 0030 item 9. The group
     of the category is highlighted. The list shows only that category under its group.
   - "Uncategorized" is not selectable. The keyboard works on all selectable slices.
   - A "Show all" control clears the selection.
5. **Colours.** Groups take `chart-1` to `chart-5` in order, and repeat at a lower opacity after 5. "Uncategorized"
   is `est`. A category takes the colour of its group, at a lower opacity for each next category. No new colour.
6. **Tooltip.** A slice shows a tooltip on hover and on keyboard focus. A group slice shows the name, the amount and
   the share of the total spending. A category slice shows the name, the group, the amount, the share of its group
   and the share of the total spending. The browser formats all values.
7. **List (amends 0030 item 11).** "Spending by category" is next to the donut. Each group is a row with its
   total and a colour dot. Its categories are rows under it. A row opens Transactions with the filter of the group,
   the category, or the uncategorized lines.
8. **Merchants (amends 0030 items 16 and 18).** The list of spending by merchant is removed from the screen and from
   the API. The tag list stays. "New merchants" in Changes does not change.
9. **API.** The report has `groups`. Each group row has `categories`. The report does not depend on the selection.
   The query has no `group` field. The page keeps `group` in its search only. `donut`, `rows` and `merchants` are removed.

## Consequences

- Spec §9 and §14 change. `docs/design.md` changes the donut colours.
- The query schema of decision 0030 loses `group`.
- Logic tests: groups with categories, "No group", "Uncategorized", refunds, order; the alignment of the arcs.
