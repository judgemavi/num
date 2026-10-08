import type { TransactionLineInput } from "@num/shared";
import { ServiceError } from "../service-error";

export type NormalizedLine = {
  amount: number;
  memo: string | null;
  categoryId: string | null;
  transferAccountId: string | null;
  tagIds: string[];
};

export function blankToNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function requireText(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ServiceError("invalid_body", 400, { field });
  }
  return trimmed;
}

function uniqueIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push(id);
  }
  return result;
}

export function normalizeLine(input: TransactionLineInput): NormalizedLine {
  return {
    amount: input.amount,
    memo: blankToNull(input.memo),
    categoryId: input.categoryId ?? null,
    transferAccountId: input.transferAccountId ?? null,
    tagIds: uniqueIds(input.tagIds ?? []),
  };
}

export function lineTotal(lines: { amount: number }[]): number {
  let sum = 0;
  for (const line of lines) {
    if (!Number.isSafeInteger(line.amount)) {
      throw new ServiceError("lines_sum_mismatch", 400);
    }
    sum += line.amount;
    if (!Number.isSafeInteger(sum)) {
      throw new ServiceError("lines_sum_mismatch", 400);
    }
  }
  return sum;
}

export function assertLineShape(accountId: string, amount: number, lines: NormalizedLine[]): void {
  if (lines.length === 0) {
    throw new ServiceError("lines_required", 400);
  }
  if (!Number.isSafeInteger(amount)) {
    throw new ServiceError("lines_sum_mismatch", 400);
  }
  let transfers = 0;
  for (const line of lines) {
    const hasCategory = line.categoryId !== null;
    const hasTransfer = line.transferAccountId !== null;
    if (hasCategory && hasTransfer) {
      throw new ServiceError("line_target_conflict", 400);
    }
    if (!hasTransfer) {
      continue;
    }
    transfers += 1;
    if (line.transferAccountId === accountId) {
      throw new ServiceError("transfer_same_account", 400);
    }
  }
  if (transfers > 1) {
    throw new ServiceError("transfer_line_limit", 400);
  }
  if (lineTotal(lines) !== amount) {
    throw new ServiceError("lines_sum_mismatch", 400);
  }
}

export function isMirrorSide(
  lines: { transferAccountId: string | null }[],
  peerAccountId: string,
  peerLineCount: number,
): boolean {
  return peerLineCount > 1 && lines.length === 1 && lines[0]?.transferAccountId === peerAccountId;
}

export function transferLine(lines: NormalizedLine[]): NormalizedLine | null {
  return lines.find((line) => line.transferAccountId !== null) ?? null;
}
