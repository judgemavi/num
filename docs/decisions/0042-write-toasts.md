# 0042 — Toasts for writes

Status: accepted (owner, 2026-10-14)

## Context

1. A write that has no form (a row action, a one-click answer on Needs review, archive, restore, undo, cover) showed
   its error as a line of text in the page. Each screen had its own line, its own `reset()` calls and its own place for
   the text. Some writes showed no error.
2. A write that the person can undo with an existing route (a "no" answer, a funding run, an import, a bucket event,
   an archive) gave no way to undo it at the place of the write.
3. A form shows the error of its write in the form (decision 0035). It must not show the error two times.

## Decision

1. The web app uses shadcn `Sonner` (package `sonner`, licence MIT, compatible with AGPL-3.0 under decision 0003).
   One `Toaster` is at the app root, bottom centre, with the light theme. The shadcn file uses no theme provider,
   because the app is light only.
2. One rule in `main.tsx`: the `onError` of the `MutationCache` shows an error toast for each failed write. The rule
   uses the TanStack Query `meta` of the mutation hook (typed with `Register.mutationMeta`):
   - `meta.form`: the hook of a form. The form shows the error with `formApi.setErrorMap`. The rule shows no toast.
   - `meta.errorText`: the text for the error code (the existing text functions of each area). Without it, the text
     is "That change did not save. Try again."
3. The pages do not show the error of a write without a form. The error lines and their `reset()` calls are removed,
   with "That answer did not save." of Needs review.
4. A write that can be undone with an existing route shows a success toast with "Undo":
   - a "no" answer of Needs review (`POST /api/review/decisions/undo`);
   - a funding run (`POST /api/funding/runs/{id}/undo`);
   - an import of a new file (`POST /api/imports/{id}/undo`);
   - a bucket event: assign, release, move and cover (`POST /api/buckets/{id}/events/{eventId}/undo`);
   - an archive of an account, bucket, category, merchant, recurring item or tag (its restore route).
   The mutation hook shows the toast in its own `onSuccess`, thus the toast shows also when the row leaves the list.
5. "Approve all" shows a success toast with the number of approved transactions and no "Undo": no route undoes an
   approval.
6. One-click "Add a recurring payment" of a detected plan uses its own hook (`useAddDetectedPlan`), because the plan
   form uses `useSavePlan` with `meta.form`.

## Consequences

- design.md §6: "Messages after a write".
- A new write hook sets `meta.form` or `meta.errorText`. A form that calls a hook without `meta.form` shows its error
  two times.
- Open point: an undo of "Approve all" needs a new route. It is not in this decision.
