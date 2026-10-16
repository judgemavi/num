import { expect, test } from "bun:test";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { at, importCsv, tempBook } from "./import-test-book";
import { listNeedsReview } from "./needs-review";
import { listOccurrences, autoLink } from "./recurring-view";
import { createSchedule } from "./schedule-test-book";
import { createTransaction, getTransaction, updateTransaction } from "./transactions";
import { undoImportBatch } from "./import-undo";

const saved = { source: "ui" as const, at };

function plan(book: ReturnType<typeof tempBook>, transferAccountId: string) {
  return createSchedule(book.db, {
    name: "Monthly transfer", kind: "commitment", accountId: book.account.id,
    categoryId: null, transferAccountId, expectedAmount: -50_000, tolerance: 0, amountMode: "fixed",
    startDate: "2026-10-01", freq: "monthly", interval: 1, monthDay: 1, businessDayShift: "none", ...saved,
  });
}

test("one recurring transfer labels an imported row as Sure and excludes a learned category", () => {
  const book = tempBook();
  try {
    const other = createAccount(book.db, { asOf: "2026-10-07", name: "Other", kind: "savings", openingBalance: 0, ...saved });
    const category = createCategory(book.db, { name: "Earlier category", kind: "expense", ...saved });
    for (const month of ["07", "08", "09"]) {
      createTransaction(book.db, {
        accountId: book.account.id, date: `2026-${month}-01`, amount: -50_000, payeeRaw: "Monthly payment",
        lines: [{ amount: -50_000, categoryId: category.id }], ...saved,
      });
    }
    const schedule = plan(book, other.id);
    const batch = importCsv(book.db, book.dir, book.account.id, "payment.csv", ["10/01/2026,Monthly payment,-50.00"]);
    if (batch.kind !== "batch") throw new Error("Expected a batch");
    const occurrence = listOccurrences(book.db, schedule.id, "2026-10-07").items.find((row) => row.dueDate === "2026-10-01");
    if (!occurrence?.transactionId) throw new Error("Expected a linked occurrence");
    const row = getTransaction(book.db, occurrence.transactionId);
    expect(row).toMatchObject({ autoReason: "recurring", autoConfidence: 990 });
    expect(row?.lines[0]).toMatchObject({ categoryId: null, transferAccountId: other.id });
    expect(row?.transferPeerId).toBeTruthy();
    expect(listNeedsReview(book.db, "2026-10-07").find((hit) => hit.id === row?.id)?.review.level).toBe("sure");
    undoImportBatch(book.db, batch.id, saved);
    expect(getTransaction(book.db, occurrence.transactionId)).toBeNull();
    expect(getTransaction(book.db, row?.transferPeerId ?? "")).toBeNull();
  } finally {
    book.close();
  }
});

test("a recurring transfer labels an open manual row but keeps confirmed and uncategorized decisions", () => {
  const book = tempBook();
  try {
    const other = createAccount(book.db, { asOf: "2026-10-07", name: "Other", kind: "savings", openingBalance: 0, ...saved });
    const category = createCategory(book.db, { name: "Confirmed", kind: "expense", ...saved });
    const schedule = plan(book, other.id);
    const open = createTransaction(book.db, {
      accountId: book.account.id, date: "2026-10-01", amount: -50_000, payeeRaw: "Payment",
      lines: [{ amount: -50_000 }], ...saved,
    });
    const confirmed = createTransaction(book.db, {
      accountId: book.account.id, date: "2026-11-01", amount: -50_000, payeeRaw: "Payment",
      lines: [{ amount: -50_000, categoryId: category.id }], ...saved,
    });
    const kept = createTransaction(book.db, {
      accountId: book.account.id, date: "2026-12-01", amount: -50_000, payeeRaw: "Payment",
      lines: [{ amount: -50_000 }], ...saved,
    });
    updateTransaction(book.db, kept.id, { lines: [{ amount: -50_000 }], keepUncategorized: true, ...saved });
    autoLink(book.db, "2026-12-07", saved);
    expect(getTransaction(book.db, open.id)?.lines[0]?.transferAccountId).toBe(other.id);
    expect(getTransaction(book.db, confirmed.id)?.lines[0]?.categoryId).toBe(category.id);
    expect(getTransaction(book.db, confirmed.id)?.autoReason).toBeNull();
    expect(getTransaction(book.db, kept.id)?.lines[0]?.transferAccountId).toBeNull();
    expect(getTransaction(book.db, kept.id)?.autoReason).toBeNull();
    expect(listOccurrences(book.db, schedule.id, "2026-12-07").items.filter((row) => row.transactionId)).toHaveLength(3);
  } finally {
    book.close();
  }
});
