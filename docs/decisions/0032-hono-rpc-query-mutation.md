# 0032 — Hono RPC client with queries and mutations

Status: approved (owner, 2026-10-13)

## Context

1. Decision 0004: "One route definition gives validation, the OpenAPI document and the typed client." No slice made
   the typed client.
2. The web app calls the API through `apiRequest(url, schema, init)` in `apps/web/src/request.ts`. There are
   approximately 125 calls. 47 of them are writes. Each call writes the URL as text and parses the response with Zod
   a second time.
3. The web app has no `useMutation`. Each write has its own `useState` for the saving state and for the error.
4. The web app has approximately 113 `invalidateQueries` calls. Each write gives the list of query keys that it
   changes. Most reads are derived from many entities (balances, Needs review, the forecast, the plan). A list is
   easy to get wrong, and then the screen shows old data.
5. The API registers routes as statements (`registerTags(app, db)` calls `app.openapi(...)`). Thus the type of the
   app has no route types, and a typed client is not possible.
6. The MCP tools are generated from the OpenAPI registry (spec §12, decision 0019).

## Decision

1. Each call from the web app to the API uses the Hono RPC client (`hc` from `hono/client`). The web app has one
   client. Its type is the type of the API routes.
2. A read is a query (`useQuery`). A write is a mutation (`useMutation`). The query and the mutation supply the
   loading state and the error. The web app has no custom state for these.
3. One global rule invalidates all queries after each successful mutation. No code invalidates a query by its key.
   Reason: most reads are derived from many entities, thus a list for each mutation goes stale easily. The API is
   local, thus the extra reads are cheap.
   The rule does not wait for the new data (changed by decision 0033). The mutation ends when the write succeeds.
   The active queries load again in the background.
4. The routes stay `@hono/zod-openapi` definitions (`createRoute` and `.openapi(...)`). Each route file builds its
   routes as one chain and returns the app. `app.ts` mounts the route files as one chain. Thus the type of the app has
   all routes. The OpenAPI document and the MCP tools do not change.
5. The web app can import types from the API package for the RPC client. The import must be `import type`. The web
   app does not import API code that runs. This changes the package boundary of decision 0004 for this one import.
6. The route gives the type of the response body. The web app does not parse the response body with Zod again. The
   web app parses only the error body, to get the error code.

## Consequences

- `AGENTS.md` changes: the package boundary rule and the rules for API calls in the web app.
- The API package has a second TypeScript project (`apps/api/tsconfig.types.json`) that writes the declarations of
  the API. The web project refers to it. Thus the web project does not compile API source and does not need the
  types of the server runtime.
- The web app has a new dependency, `hono` (MIT), for `hono/client`. The API has the same version.
- The lint rule for imports lets the web app import only types from the API package.
- `apps/web/src/api/` contains the client, the query options and the mutation hooks.
- The conversion is done folder by folder. The first folder is `settings`. Until the last folder is done, the
  unconverted folders use `apiRequest` and invalidate queries by key.
- `apps/web/src/request.ts` is removed when the last caller is converted.
- After a successful write, the mutation ends immediately. A form closes at that time. For a short time, a list can
  show the old data.
- The component that does a write calls its own mutation hook. A callback that is given to `mutate(...)` runs when the
  write succeeds, before the new data arrives.
- When a row must not accept a second click before the new data arrives, the row uses the state of its mutation and
  the fetch state of the list (`useIsFetching`).
- An editor shows the loading line only for the first load. A background read does not remove a form that is on the
  screen.
