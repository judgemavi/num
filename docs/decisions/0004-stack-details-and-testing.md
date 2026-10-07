# 0004 — Stack details, list queries and testing

Writing standard: ASD-STE100.

Status: accepted
Date: 2026-10-07

## Context

- The spec gives the main stack (§13). Some details were not decided.
- Lists (transactions, merchants, Inbox) must keep filter, sort and page state in the URL.
  The URL state must agree 1:1 with the API call.
- The owner does usability tests of the app. The owner does not want tests that have low value.

## Decision

### Stack details

- **Routes:** `@hono/zod-openapi`. One route definition gives validation, the OpenAPI document and the typed client.
- **Package boundary:** `packages/shared` contains Zod schemas, types and codes. The web app imports only `packages/shared`.
  The web app does not import `packages/db` or API code.
- **Dates:** `Temporal.PlainDate` for calendar arithmetic, with a polyfill where the runtime does not have it.
  Do not use `Date` for calendar dates.
- **One container:** One Hono process serves the API, MCP and the built web app on one port.
- **Tables:** shadcn `Table` components. Do not use TanStack Table. Do not use virtual scrolling.

### List queries

- Pagination is on the server. Use offset pagination: `page` (from 1) and `pageSize` (default 50, maximum 200).
- The default sort is `date desc, id desc`. `sort` accepts only the column names in the schema. `dir` is `asc | desc`.
- One Zod schema in `packages/shared` defines each list query. The router validates the URL search with it.
  The API validates the query string with it. The TanStack Query key is the parsed object.
- The response contains `items`, `page`, `pageSize` and `total`.
- Rules:
  - Do not write default values into the URL.
  - A change to a filter or the sort sets `page` to 1.
  - Search input waits 300 ms before it changes the URL.
  - If `page` is after the last page, the API returns empty `items` and `total`. The UI goes to the last page.
- Row selection and column preferences are local UI state. They are not in the URL.

### Testing

- Write tests only for logic:
  - Money calculations and balances.
  - Invariants (spec §5).
  - Parsers, identity, duplicates and matching.
  - Payee normalization and suggestions.
  - Recurring dates, buckets, funding, forecast and mortgage calculations.
  - State rules (reconcile, close, undo).
  - Authentication and authorization.
- Do not write tests for:
  - Simple create, read, update and delete routes without rules.
  - UI rendering and components.
  - Framework or library behavior.
  - Schema shape.
- There are no browser end-to-end tests. The owner does usability tests.

## Consequences

- The roadmap acceptance criteria contain only logic tests and owner checks.
- The PR description contains a manual check list for UI changes. The owner uses it in usability tests.
