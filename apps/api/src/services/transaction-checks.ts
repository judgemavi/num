import { accounts, categories, merchants, tags } from "@num/db";
import { eq } from "drizzle-orm";
import { ServiceError } from "../service-error";
import type { Header } from "./transaction-record";
import { loanPaymentLines, type NormalizedLine } from "./transaction-rules";
import type { WriteTx, Reader } from "./write";

export function assertPayee(existing: { source: string; payeeRaw: string }, payeeRaw: string): void {
  if (existing.source === "import" && existing.payeeRaw !== payeeRaw) {
    throw new ServiceError("payee_raw_locked", 409);
  }
}

function assertAccount(tx: WriteTx, id: string, previousId: string | null): void {
  const row = tx.select({ archivedAt: accounts.archivedAt }).from(accounts).where(eq(accounts.id, id)).get();
  if (!row) {
    throw new ServiceError("account_not_found", 404);
  }
  if (row.archivedAt !== null && id !== previousId) {
    throw new ServiceError("account_archived", 409);
  }
}

function assertCategory(tx: WriteTx, id: string): void {
  const row = tx.select({ archivedAt: categories.archivedAt }).from(categories).where(eq(categories.id, id)).get();
  if (!row) {
    throw new ServiceError("category_not_found", 404);
  }
  if (row.archivedAt) {
    throw new ServiceError("category_archived", 409);
  }
}

function assertTag(tx: WriteTx, id: string): void {
  const row = tx.select({ archivedAt: tags.archivedAt }).from(tags).where(eq(tags.id, id)).get();
  if (!row) {
    throw new ServiceError("tag_not_found", 404);
  }
  if (row.archivedAt) {
    throw new ServiceError("tag_archived", 409);
  }
}

function assertMerchant(tx: WriteTx, id: string | null): void {
  if (id === null) {
    return;
  }
  const row = tx.select({ archivedAt: merchants.archivedAt }).from(merchants).where(eq(merchants.id, id)).get();
  if (!row) {
    throw new ServiceError("merchant_not_found", 404);
  }
  if (row.archivedAt) {
    throw new ServiceError("merchant_archived", 409);
  }
}

export function assertReferences(
  tx: WriteTx,
  header: Header,
  lines: NormalizedLine[],
  previous: { accountId: string | null; transferAccountId: string | null },
): void {
  assertAccount(tx, header.accountId, previous.accountId);
  assertMerchant(tx, header.merchantId);
  for (const line of lines) {
    if (line.transferAccountId) {
      assertAccount(tx, line.transferAccountId, previous.transferAccountId);
    }
    if (line.categoryId) {
      assertCategory(tx, line.categoryId);
    }
    for (const tagId of line.tagIds) {
      assertTag(tx, tagId);
    }
  }
}

/** A transaction with more than one line is a loan payment: an expense category and a transfer to a mortgage or a loan. */
export function assertLoanPaymentTargets(db: Reader, lines: NormalizedLine[]): void {
  const loan = lines.length > 1 ? loanPaymentLines(lines) : null;
  if (!loan) {
    return;
  }
  const kind = db.select({ kind: categories.kind }).from(categories).where(eq(categories.id, loan.categoryId)).get()?.kind;
  const target = db.select({ kind: accounts.kind }).from(accounts).where(eq(accounts.id, loan.loanAccountId)).get()?.kind;
  if (kind !== "expense" || (target !== "mortgage" && target !== "loan")) {
    throw new ServiceError("lines_not_loan_payment", 400);
  }
}
