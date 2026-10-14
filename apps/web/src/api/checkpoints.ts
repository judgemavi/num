import type { CheckpointCreate, Clearance } from "@num/shared";
import { queryOptions, useMutation } from "@tanstack/react-query";
import { api, unwrap } from "@/api/client";

/** The checkpoints of an account and the closing date and the closing balance of the last imported statement. */
export function checkpointListQuery(accountId: string) {
  return queryOptions({
    queryKey: ["checkpoints", accountId],
    queryFn: () => unwrap(api.accounts[":id"].checkpoints.$get({ param: { id: accountId } })),
  });
}

/** Compare a statement balance with the book. This does not save a checkpoint. */
export function checkpointCompareQuery(accountId: string, { date, statementBalance }: CheckpointCreate) {
  return queryOptions({
    queryKey: ["checkpoint-compare", accountId, date, statementBalance],
    queryFn: () =>
      unwrap(api.accounts[":id"].checkpoints.compare.$get({ param: { id: accountId }, query: { date, statementBalance } })),
  });
}

export function useCreateCheckpoint() {
  return useMutation({
    mutationFn: ({ accountId, body }: { accountId: string; body: CheckpointCreate }) =>
      unwrap(api.accounts[":id"].checkpoints.$post({ param: { id: accountId }, json: body })),
  });
}

export function useUnlockCheckpoint() {
  return useMutation({
    mutationFn: ({ accountId, checkpointId }: { accountId: string; checkpointId: string }) =>
      unwrap(api.accounts[":id"].checkpoints[":checkpointId"].unlock.$post({ param: { id: accountId, checkpointId } })),
  });
}

/** Mark transactions of an account as cleared or open. */
export function useMarkClearance() {
  return useMutation({
    mutationFn: ({ accountId, body }: { accountId: string; body: Clearance }) =>
      unwrap(api.accounts[":id"].clearance.$post({ param: { id: accountId }, json: body })),
  });
}
