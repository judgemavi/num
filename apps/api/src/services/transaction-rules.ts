import { blankToNull } from "./text";
import type { TransactionLineInput } from "@num/shared";
import { ServiceError } from "../service-error";

export type NormalizedLine = {
  amount: number;
  memo: string | null;
  categoryId: string | null;
  transferAccountId: string | null;
  tagIds: string[];
};

export function requireText(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ServiceError("invalid_body", 400, { field });
  }
  return trimmed;
}

function uniqueIds(ids: string[]) {
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

function lineTotal(lines: { amount: number }[]): number {
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
  for (const line of lines) {
    if (line.categoryId !== null && line.transferAccountId !== null) {
      throw new ServiceError("line_target_conflict", 400);
    }
    if (line.transferAccountId === accountId) {
      throw new ServiceError("transfer_same_account", 400);
    }
  }
  if (lineTotal(lines) !== amount) {
    throw new ServiceError("lines_sum_mismatch", 400);
  }
  if (lines.length > 1 && !loanPaymentLines(lines)) {
    throw new ServiceError("lines_not_loan_payment", 400);
  }
}

/**
 * The lines of a loan payment: two lines, both money out, one category line (the interest) and one
 * transfer line (the principal). The kinds of the category and of the account are checked with the stored records.
 */
export function loanPaymentLines(lines: NormalizedLine[]) {
  if (lines.length !== 2 || lines.some((line) => line.amount >= 0)) {
    return null;
  }
  const categoryId = lines.find((line) => line.transferAccountId === null)?.categoryId ?? null;
  const loanAccountId = lines.find((line) => line.categoryId === null)?.transferAccountId ?? null;
  return categoryId !== null && loanAccountId !== null ? { categoryId, loanAccountId } : null;
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
