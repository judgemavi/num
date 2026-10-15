# Instructions for coding agents

Writing standard: ASD-STE100 (Simplified Technical English). Use it for all docs, PR descriptions and commit messages.

## Sources of truth

1. `docs/spec.md` — what the app is. Do not change it.
2. `docs/design.md` — the look of the web app.
3. `docs/roadmap.md` — the open slices and their acceptance criteria.

If the spec is not clear, or if two documents do not agree: **stop and ask the owner.** Do not guess. Do not design a new concept.
If you think the spec is wrong, write a proposed decision record (`docs/decisions/NNNN-title.md`, status "proposed"). Then stop.
A decision record is a change request, not an archive. When the owner approves it, the slice applies its rules to
`docs/spec.md`, `docs/design.md` or this file, then deletes the record in the same commit. Do not cite decision numbers
in docs or code. Git history keeps the records. An idea that the owner refuses goes in spec §3.1 with its reason.

## Work rules

- Do one roadmap slice at a time. Use a branch from `main` with the name `v2/<slice>-<short-name>`. Example: `v2/2.2-import-pipeline`.
- Do not commit to `main`. Do not merge. The owner merges after review.
- Do only the work in the slice. Do not add features, screens, fields or settings that the spec does not have.
- Do not leave TODOs, placeholders or partial features. If you cannot complete an item, stop and tell the owner.
- Do not add compatibility code, aliases or shims. v2 has no users before cutover.
- Do not add a dependency without a reason in the PR description.
  The dependency license must be compatible with AGPL-3.0.

## Data safety

- Do not run SQL by hand on any real database. Do not "fix" data with scripts.
- Never edit a migration's `when` timestamp or its journal entry by hand. Drizzle applies migrations by timestamp;
  a wrong timestamp makes it skip later migrations silently. After a rebase, regenerate the migration instead.
- The `v1` branch is private and read-only. Read it only with `git show v1:<path>`.
  Do not check it out, merge it, rebase it or push it.
- Tests must use temporary databases.
- Money is integer milliunits: thousandths of the major unit, for every currency.
  Do not use floating-point numbers for money. Round a calculated amount to the minor unit of the book currency with
  the helpers in `packages/shared/src/currency.ts` (`divideAmount`, `roundToStep`, `floorToStep`).
  Do not write a fixed amount (a tolerance, a threshold) in code; express it in steps of the book currency.

## Open source rules

- Do not put personal data in the repository: real statements, names, merchants, balances or account numbers.
  Make synthetic test fixtures.
- Do not write values for one country, bank or currency in code. Use settings and presets (spec §2.8, §7.2).
- The backend has no time zone and no locale. Do not call "today" on the server. Use `asOf` from the request (spec §4).
- The API returns codes, integers and ISO strings. Do not return formatted text, numbers or dates (spec §4).
- Make all UI text and all formatting in the browser. Use `Intl` for numbers, currency and dates.

## Code rules

- Put business logic in service functions in `apps/api/src/services/`. Routes and MCP tools only validate input and call services.
- Each service function that writes data uses one database transaction and writes the audit log (§11).
- Keep files under 400 lines. Keep functions small.
  Exception: generated files (`routeTree.gen.ts`, shadcn components in `components/ui/`).
- Do not edit `routeTree.gen.ts` by hand.
- You can edit shadcn files in `components/ui/` to change styles and variants (shadcn expects this).
  Do not change their behavior. Keep the change small.
- Add a shadcn component only in the slice that uses it. Remove components that no code uses.
- Do not keep dead code.
- Use the shadcn components in `apps/web/src/components/ui/`. Do not add TanStack Table or virtual scrolling.
- Use shadcn components for all UI controls. Add them with the shadcn CLI when a slice needs them:
  - Forms: `Field` and `Label`.
  - Short lists of options: `Select`.
  - Long lists of options: Combobox (`Command` + `Popover`).
  - Create and edit: `Dialog`.
  - Lists of records: ListCard rows (`docs/design.md` §6). `Table` only for the Transactions list.
  - Confirmations: `AlertDialog`.
- Do not use native `<select>`, `<label>` or custom-styled inputs.
- Before you write a UI component, check the shadcn component list (https://ui.shadcn.com/docs/components).
  If shadcn has it, add it with the CLI and style its variants. Do not write your own.
  Examples: Badge, Toggle, ToggleGroup, Progress, Collapsible, Card, Sidebar, Sheet, Tabs, Tooltip, Skeleton.
- Follow `docs/design.md` for every UI change: tokens, type, page pattern and components. Do not add other colours or fonts.
- Style with Tailwind classes in the components. `index.css` contains only tokens (`@theme`), base styles and the font.
  Do not write global component CSS. Do not target shadcn internals (`data-slot`) from CSS.
- The web app imports only `packages/shared`. Do not import `packages/db` or API code in the web app.
  Exception: `apps/web/src/api/client.ts` imports the API route types with `import type` for the RPC client.
- Calls from the web app to the API:
  - Each route file builds its routes as one `@hono/zod-openapi` chain and returns the app. `app.ts` mounts the route
    files as one chain. Thus `AppType` has every route for the RPC client.
  - Use only the Hono RPC client (`api` in `apps/web/src/api/client.ts`). Do not call `fetch` in a component.
  - Put the query options and the mutation hooks in `apps/web/src/api/`, one file for each resource.
  - A read is a `useSuspenseQuery` (or `useSuspenseQueries` for reads that start together). A write is a
    `useMutation`. The data of a read is always defined. Do not write `isPending` or `isError` branches for a read,
    and do not write a fallback value for data that is not loaded.
  - A `Boundary` (`components/boundary.tsx`) shows the loading text and the error text with "Try again". Each screen
    has one. The editor host has one. A card or a panel that loads by itself has its own.
  - A component that reads data after a parent has read its data makes the reads wait in sequence. Start the read
    earlier: `usePrefetchQuery` in the parent, or `prefetchQuery` in the loader of the route.
  - A list keeps its rows on the screen while a new page, filter or sort order loads: read with
    `useDeferredValue(search)`. Use the same method for a read that starts later from data in a form.
  - Use `useQuery` with `skipToken` only for a read that follows the text that a person types in a form
    (a suggestion). Do not use `enabled` with a placeholder id.
  - Get the state and the error of a write from the mutation. Do not keep them in `useState`.
  - Do not call `invalidateQueries`. One rule in `main.tsx` invalidates all queries after each successful mutation.
    The rule does not wait for the new data. A form closes when its write succeeds. The lists load again in the
    background.
    Exception: a mutation hook that deletes a record calls `removeQueries` for that record in its `mutationFn`.
    Thus the rule does not read a record that is not in the book.
  - Do not parse a response body with Zod. The route gives its type.
  - Each mutation hook sets `meta`: `formWrite` when a form shows the error, or `errorText` (the toast text for each
    error code). Without them, the toast says "That change did not save. Try again."
  - A component that does a write calls its own mutation hook. Do not pass a mutation as a prop.
  - Do not stop a query to keep a form on the screen. An editor shows the loading line only for the first load.
  - `main.tsx` sets the defaults of each read: no second request after an answer with an error code, one more
    request after no answer, and data stays fresh for 30 seconds.
- TypeScript and components:
  - Types come from inference: Drizzle, Zod (`z.infer`), the Hono RPC client, `queryOptions` and the router.
  - Do not declare a type that the compiler can infer.
  - Do not use a cast (`as`) to get a type back. Correct the source of the type.
  - A component that needs server data calls its own query. The query cache removes duplicate requests.
  - A component that does a write calls its own mutation hook.
  - Pass `children` or a slot to a component. Do not pass data through layers of components.
  - Server data is not a prop. Do not pass the book currency, `asOf`, a shared list (accounts, categories, groups,
    merchants, tags), a map of names or the result of a query to a component. The component that shows the value
    reads it. A row can get its record from the list that makes the rows. A form can get the record that it changes.
  - `Amount` reads the book currency. For a pure format function, get the currency with `useBookCurrency()`.
  - Get today with `localAsOf()` (`as-of.ts`). Do not write a second function for today.
  - Get a name from an id with the hooks in `editors/lookups.ts` (`useCategoryNames()` and the others). Do not make a
    `Map` of names in a component.
  - When more than one part of a screen shows the same read, each part calls the same hook for it
    (`useSpendingReport()`). The screen starts the reads of its parts with `usePrefetchQuery`.
- Use `Temporal.PlainDate` for calendar dates. Do not use `Date` for calendar dates.
- Lists: one shared Zod query schema for the URL and the API. The list rules are in spec §4 (Lists).
  - A route gives its shared schema to `validateSearch` through `searchWithDefaults(...)`. A value in the URL that is
    not valid then goes back to its default. The API uses the schema itself and answers 400. The router infers the
    search types. Do not write a type or a function for the search of a route. The root route validates `edit`.
  - The router reads and writes the URL with `lists/search-params.ts`: a number is text in the URL.
  - A link or a `navigate` call gives only the search values that are not the defaults.
  - Each list has one hook that calls `useListSearch` (`lists/use-list-search.ts`) with the search and `navigate` of
    its route and with its default sort order. The hook gives the list query (without `edit`), `patch`, the typed sort
    functions and `setPage`. A filter bar and a sort control call the hook of their list. They do not get `search`
    or `onChange` props.
  - Use `SearchBox` for a search box, a TanStack form for a filter panel, `useLastPage` with `ListPager` for the
    pages, `SortSelect` for the sort control and `ArchiveMenuItem` for "Archive" and "Restore" in a row menu.
  - The key of a list query has only the values that the request uses. `edit` is not in a key or in a request.
- Forms:
  - Each form uses `useAppForm` (`forms/form-hook.ts`). Do not keep the value of a field in `useState`.
  - Use the field components (`field.TextField`, `field.MoneyField`, `field.SelectField` and the others) in
    `form.AppField`. For a picker, use `form.Field` and give `field.state.value` and `field.handleChange` to it.
  - Put `form.FormShell`, `form.SubmitButton` and `form.FormError` inside `form.AppForm`.
  - Make a part of a form in its own component with `withForm`. Do not pass values and change handlers as props.
  - The start values come from the record that the form changes. The form infers the type of its values from them.
    Use `fieldValue<T>(...)` when a start value is narrower than the field.
  - Check the values in `validators.onSubmit` and return the text of the error. Call `mutateAsync` in `onSubmit`.
    Give the error of the write to the form with `formApi.setErrorMap({ onSubmit: { form: text, fields: {} } })`.
    The `validators.onSubmit` of the form clears that error when the person submits again. Thus each form that
    writes has one.
  - A change that follows a change of a field goes in the `listeners` of that field. A change that the form makes
    (a suggestion, a fill from the schedule) does not mark the field as changed.
  - An edit form sends only the fields that differ from its start values (`editPatch`). A money field that the person
    did not change keeps the stored amount (`keptAmount`). An edit with no change closes without a write.
  - Keep `useState` only for state of the screen: open or closed, the selected row, the hover.
- For a control with a fixed list of choices, use `ChoiceSelect` (`components/choice-select.tsx`) or `choiceIn`
  (`components/choice.ts`). They give the type of the choices. Do not use a cast on the value of a control.

## Editors and dialogs

- Follow `docs/design.md` §6b: one shared editor for each entity, one dialog host at the app root, `openEditor(...)`.
  Do not add a dialog inside a screen or a list row. Use the shared `confirm()`.
- A form closes through `useEditorFrame()`: `close()` to cancel, `close(id)` after a save. The dialog host and the
  inline place of a picker (`ManagedPicker`) each supply the frame. Do not pass `onClose` or `onSaved` props.
- Each editor kind has one entry in `EditorInput` (`editors/editor-types.ts`) and one component in
  `editors/editor-registry.tsx`. The input of the kind is the props of the component.

## Tests

- Write tests only for logic: money calculations and balances; invariants (spec §5); parsers, identity, duplicates
  and matching; payee normalization and suggestions; recurring dates, buckets, funding, forecast and mortgage
  calculations; undo.
- Do not write tests for simple CRUD, UI rendering, framework behavior or schema shape.
- Do not write browser end-to-end tests. The owner does usability tests.
- Use plain language in the UI (spec §2.6).

## Running the app

- Do not use the owner's ports (API 3000, web 5173) or the owner's data folder (`.data`).
  Use your own `PORT`, `WEB_PORT`, `API_PORT` and a `DATA_DIR` under `/tmp`.
- Stop every server that you started before you report the slice as finished.

## Verification

Before you open a PR, run all of these. All must pass:

```sh
bun test
bun run --filter api typecheck
bun run --filter web build
bun run --filter web lint
```

For UI changes, write a manual check list in the PR for the owner's usability test. Do not say that the UI works if a person did not examine it.

## PR description

Write it in ASD-STE100. Include:
1. Slice and spec sections.
2. What changed.
3. How you verified it (commands and results).
4. Manual check list (UI only).
5. Open questions.

Do not write progress logs in the repository. The PR description is the record.
