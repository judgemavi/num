# 0010 — Compact filters, Settings subpages, no manual group order

Writing standard: ASD-STE100.

Status: accepted
Date: 2026-10-07

## Context

- The filter fields on list screens use too much space.
- The Settings page is long and has too many controls.
- The owner does not want to move groups up or down.

## Decision

- List screens use one compact filter bar (`docs/design.md` §6, Filters).
- Settings areas are subpages with their own URLs: Groups, Categories, Tags, Backup.
- Groups and categories sort by name, without case. Remove `category_groups.sort_order` and the reorder operation.
- Group names are unique. The comparison ignores case.

## Consequences

- Roadmap slice D.2 makes these changes, with a migration that removes `sort_order` and adds the unique group name index.
- Slice 0.6 puts "Download backup" on the Backup subpage.
