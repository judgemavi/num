# 0033 — Inferred types and composition in the web app

Status: approved (owner, 2026-10-13)

## Context

An audit of the web app after decision 0032 found these problems.

1. Types are declared by hand where the compiler can infer them. The web app has 146 hand-declared types.
2. The editor layer erased its types. `editors/editor-stack.ts` kept each frame as `kind: string; props: unknown`.
   `editors/editor-body.tsx` had 18 `props as EditorInput[...]` casts. With `editors/editor-host.tsx`, there were 21
   `as EditorInput` casts.
3. Components pass props through layers. `onSaved` was declared on 31 components and `onClose` on 23. The host passed
   them to the body, the body to a `*Record` wrapper, the wrapper to the editor, and the editor to the form.
   `TransactionRecord` only passed its props on. `onClose` was a prop of `BucketForm` and `PlanForm` that no code used.
   `currency` is a prop on 43 of 145 components.
4. The editor wrappers were in `record-editors.tsx`, `settings-editors.tsx`, `action-editors.tsx` and
   `more-editors.tsx`. The file line limit made this split, not the entities.
5. The dialog host used module-level objects, several refs and a `suppress` counter.
6. The invalidation rule of decision 0032 returned its promise. Thus a mutation stayed pending until all active
   queries had new data. A callback in `mutate(...)` then ran late, and did not run if its component was removed
   during the read. To prevent this, two forms got their mutation from a parent as a prop, screens owned the
   mutations of their rows, and editors stopped their queries when a write started.
7. Each screen has its own loading and error branches. "Try again" branches are in 29 files.
8. The database columns for codes are untyped text. Thus the API has 21 `asKind`-style narrowing functions and
   27 casts.

## Decision

1. Types come from inference: Drizzle, Zod (`z.infer`), the Hono RPC client, `queryOptions` and the router.
   Code does not declare a type that the compiler can infer.
2. Code does not use a cast to get a type back. The source of the type is corrected.
   A component can declare its props. A union for a real state of the UI is permitted.
3. A component that needs server data calls its own query. The query cache removes duplicate requests.
4. A component that does a write calls its own mutation hook. A mutation is not passed as a prop.
5. A parent composes its children. It passes `children` or a slot. It does not pass data through layers of
   components.
6. The invalidation rule does not wait for the new data. This changes decision 0032, item 3: all queries are
   invalidated after each successful mutation, and the promise is not returned.
7. An editor frame is a discriminated union that is derived from `EditorInput`. A registry gives the component of
   each kind. The input of the kind is the props of the component.
8. A form closes through `useEditorFrame()`. The dialog host supplies the frame for the open editor. A picker
   supplies the frame for the form that it shows inline. No code passes `onClose` or `onSaved` props.
9. The dialog host keeps one open editor. Editors did not stack before this decision: `openEditor` closed the open
   editor first (decision 0018, `docs/design.md` §6b). Thus the stack structure is removed.

## Consequences

- `AGENTS.md` changes: the rules for API calls, a "TypeScript and components" group of rules, and the rules for
  editors and dialogs.
- Decision 0032 changes: item 3 and the consequences of the invalidation rule.
- The refactor is done in steps:
  1. Editors and invalidation (this step).
  2. Suspense and error boundaries.
  3. Components that read their own data.
  4. Typed database columns.
  5. List search.
  6. Forms.
- After a write, a list can show the old data for a short time. A row that must not accept a second click before
  the new data arrives uses the state of its mutation and the fetch state of the list.
- The one-click answers of the Transactions table are in the row. Thus the message "That answer did not save."
  shows in the row that failed, not above the table.
- When an open editor deletes its record, the editor closes at once. The mutation hook that deletes a record removes
  the read of that record from the cache before the invalidation rule runs (step 2). Thus no read asks for the
  deleted record. This is the one exception to "no code changes a query by its key".
- Step 2: a read is a `useSuspenseQuery`. A `Boundary` component shows the loading text and the error text with
  "Try again" for each screen, for the open editor, and for a card or a panel that loads by itself. A list reads with
  `useDeferredValue(search)`, thus the rows stay on the screen while a new page or filter loads. The query client
  does not send a second request after an answer with an error code, and data stays fresh for 30 seconds.
- An editor shows the loading line only for the first load. A read in the background does not remove a form that is
  on the screen.
- A click on an action in a row menu does not open the row also. Before this step, the click went to the row, and
  the row opened its editor in place of the editor of the action.
- Step 3: server data is not a prop. `Amount` reads the book currency. The hooks in `editors/lookups.ts` give the
  shared lists and the maps of names. Each card of Home and each part of the Buckets, Transactions and Insights
  screens reads its own data and does its own writes. `OverspentPanel` keeps its state and does its write, thus the
  message for a cover that failed shows in the panel. The message for an archive that failed shows under the row of
  the bucket. The message for "Keep it unassigned" shows above the paycheck card.
- Step 5: a route gives its shared Zod schema to `validateSearch` and the router infers the search types. The web app
  does not have `zod` as a dependency, thus it cannot add `edit` to a schema. The root route validates `edit`, and each
  route gets it from the root. `useListSearch` gives the list query of a route without `edit`, thus an editor that
  opens or closes does not start a read of the list. The read of the active and archived records of a list gets the
  two lists through the query cache, thus it shares the request with the screen that shows the active list.
- Step 5: the editor host also keeps `reconcile` on the page of an account the same as the reconcile editor. The
  "Reconcile" button opens the editor. The editor adds one history entry, and "Back" closes it. When the editor closes,
  the history entry is removed. Before this step, the open and the close each added a history entry.
- Step 5: the import editor keeps its files and the progress of the batch in one reducer. The function
  `runImportBatch` imports the files. The Transaction form fills the lines of a mortgage payment when the read of the
  schedule completes, with a change of state during render. The component `MortgageSplitWatch` is removed.
- Step 5: the Account form does not parse its request body with Zod. The compiler checks the body, and the API
  validates it. A name that has only spaces gets the same message, from the answer of the API.
