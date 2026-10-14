# 0035 — TanStack Form for all forms

Status: accepted (owner, 2026-10-14)

## Context

1. Each form of the web app kept each field in its own `useState`. The Transaction form had 21 `useState` calls. The
   web app had 153 `useState` calls in 36 files. Most of them held form values.
2. Each form had a custom error state (`invalid`, `nameMissing`, `notice`) next to the error of its mutation.
3. Parts of the Transaction form got the values and a change handler for each field as props. `WhatIsThis` had 25
   props, `MoneySection` 10 and `MoreDetails` 12. The Transaction form, the mortgage terms and the import column map
   had hand-written types for their values.
4. The filter panels kept their changes in `useFilterDraft`, and the search boxes kept their text in `useSearchText`.
   The two hooks did by hand what a form library does.
5. The owner asked for TanStack Form, with its own APIs, because it works with the other TanStack libraries of the app.

## Decision

1. The web app uses `@tanstack/react-form` (version 1.33, licence MIT). MIT is compatible with AGPL-3.0
   (decision 0003). It supports React 19 and reads Zod 4 schemas through Standard Schema.
2. The app has one form hook, made with `createFormHook` and `createFormHookContexts` (`apps/web/src/forms/`):
   - Field components: `TextField`, `MoneyField`, `TextareaField`, `DateInputField`, `SelectField`,
     `ComboboxField`, `SwitchField` and `CheckboxField`. Each one reads its field with `useFieldContext` and shows the
     shadcn `Field`.
   - Form components: `FormShell` (the `<form>` of a dialog, or the `<div>` of an inline form that submits on Enter),
     `SubmitButton` (it reads `isSubmitting` with `form.Subscribe`) and `FormError` (the first error of the form).
3. A part of a form that is in its own component is made with `withForm`: `MoneySection`, `WhatIsThis`,
   `SplitLines`, `RefundOfField`, `MoreDetails`, `MortgageSection`, `BucketPickers` and the parts of the Account form.
   The part reads and changes the fields of the form. It gets no values and no change handlers as props.
4. The start values come from the record that the form changes, through one function for each form
   (`transactionValues`, `accountValues`, `bucketValues`, `planValues`). The form infers the type of its values from
   that function. A form part made with `withForm` gets the same type from the values of a new record.
5. `validators.onSubmit` checks the values and gives the same error texts as before. The Setup form and the name forms
   (group, tag, merchant) give the shared Zod schema as a Standard Schema validator. The other forms read text
   amounts first, thus they call the shared schema in their validator.
6. `onSubmit` calls the `mutateAsync` of the mutation. When the write fails, the form gets the error with
   `formApi.setErrorMap`. The submit validator clears that error when the person submits again. Thus the Save button
   is disabled only while the form submits, and a failed save can be tried again.
7. A change that follows the change of a field is a `listeners.onChange` of that field. Examples: a new kind of account
   clears the card fields; a new "What is this?" choice clears the fields that do not fit it. A change that the form
   makes (the suggestion, the lines of a mortgage payment) uses `dontUpdateMeta` and `dontRunListeners`. The
   suggestion stops when the person changes one of the fields of "What is this?": the form reads the `isTouched` meta
   of these fields.
8. A filter panel is a form. "Apply" submits it, "Clear" resets it to no filters, and opening the panel resets it to
   the filters in the URL. A search box is a form field. Its listener has `onChangeDebounceMs: 300` and writes the text
   to the URL. An effect gives the field a text that the URL gets from Back, Forward or a link.
9. `useState` stays only for the state of the screen: open or closed, the selected row, the hover.

## Consequences

- `AGENTS.md` changes: a "Forms" group of rules, and the rules for the search box and the filter panel.
- `useSearchText`, `useFilterDraft`, `DialogForm`, the old `FormShell` and the hand-written values types are removed.
- The oxlint rule `only-export-components` knows `withForm` as a component wrapper (`customHOCs`).
- The "Applied to N · skipped M" notice of the Transaction form is removed. The single-save API never sets `applied`
  or `skipped`. This closes the open point of decision 0034. The group route keeps its result.
- The group route has no `excludedIds`. No caller sent a value other than an empty list. A client that must not
  change a row does not send its id.
- A list page reads invalid search values as their defaults (`searchWithDefaults` in `packages/shared`). The API
  uses the query schema itself and still answers 400.
- The router reads and writes the URL search with `apps/web/src/lists/search-params.ts`. A number is text in the URL
  (`window=12`, `q=12`). The default of the router wrote `window="12"`.
