import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkpoints, inboxDecisions, migrateDatabase, openDatabase, settings, transactions } from "@num/db";
import { columnMapSchema } from "@num/shared";
import { eq } from "drizzle-orm";
import { expect, test } from "bun:test";
import { createDb, type Db } from "../db";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { decideInboxItem } from "./inbox-decisions";
import { acceptTransferPair } from "./suggestions";
import { applyInboxGroup } from "./inbox-group";
import { importStatement } from "./imports";
import { undoImportBatch } from "./import-undo";
import { loadMatchBook } from "./match-book";
import { listNeedsReview } from "./needs-review";
import { approveFiltered } from "./review-approve";
import { acceptLooksRight, createTransaction, getTransaction, updateTransaction } from "./transactions";

const at = "2026-03-20T16:00:00.000Z";
const saved = { source: "ui" as const, at };
const asOf = "2026-03-20";

type Ids = { dir: string; cheque: string; savings: string; fees: string; other: string };

function withBook(run: (db: Db, ids: Ids) => void) {
  const dir = mkdtempSync(join(tmpdir(), "num-auto-link-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const db = createDb(sqlite);
  try {
    db.insert(settings).values({ key: "currency", value: "USD" }).run();
    const open = { kind: "chequing" as const, openingDate: "2025-01-01", openingBalance: 0, ...saved };
    const cheque = createAccount(db, { name: "Everyday", ...open });
    const savings = createAccount(db, { name: "Savings", ...open });
    const fees = createCategory(db, { name: "Fees", kind: "expense", ...saved });
    const other = createCategory(db, { name: "Other", kind: "expense", ...saved });
    run(db, { dir, cheque: cheque.id, savings: savings.id, fees: fees.id, other: other.id });
  } finally {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

const columnMap = columnMapSchema.parse({
  hasHeader: true,
  date: 0,
  description: 1,
  amount: 2,
  dateOrder: "mdy",
  signConvention: "account",
  decimalSeparator: ".",
});

function statement(db: Db, ids: Ids, accountId: string, name: string, lines: string[]) {
  const result = importStatement(db, ids.dir, {
    source: "import",
    at,
    asOf,
    accountId,
    filename: `${name}.csv`,
    mimeType: "text/csv",
    bytes: new TextEncoder().encode(["date,description,amount", ...lines].join("\n")),
    columnMap,
  });
  if (result.kind !== "batch") {
    throw new Error("The import did not make a batch");
  }
  return result;
}

/** The person confirmed a transfer for this payee before: the source row is a normal transfer row. */
function learnTransfer(db: Db, ids: Ids, payee: string) {
  createTransaction(db, {
    accountId: ids.cheque,
    date: "2026-01-05",
    amount: -1_000,
    payeeRaw: payee,
    status: "cleared",
    lines: [{ amount: -1_000, transferAccountId: ids.savings }],
    ...saved,
  });
}

function rowsOf(db: Db, amount: number) {
  return db.select().from(transactions).where(eq(transactions.amount, amount)).all().filter((row) => !row.mirror);
}

function review(db: Db, id: string) {
  return listNeedsReview(db, asOf).find((hit) => hit.id === id)?.review;
}

function pairImport(db: Db, ids: Ids, outPayee: string, inPayee: string) {
  const out = statement(db, ids, ids.cheque, "out", [`03/10/2026,${outPayee},-50.00`]);
  const incoming = statement(db, ids, ids.savings, "in", [`03/11/2026,${inPayee},50.00`]);
  return Object.assign(incoming, { outId: out.id });
}

test("a pair with a learned transfer payee links by itself and both rows are Sure", () => {
  withBook((db, ids) => {
    learnTransfer(db, ids, "MOVE TO SAVINGS");
    pairImport(db, ids, "MOVE TO SAVINGS", "FROM EVERYDAY");
    const [out] = rowsOf(db, -5_000);
    const [incoming] = rowsOf(db, 5_000);
    expect(out?.transferPeerId).toBe(incoming?.id ?? "missing");
    expect(incoming?.transferPeerId).toBe(out?.id ?? "missing");
    expect(out?.autoReason).toBe("transfer_match");
    expect(incoming?.autoReason).toBe("transfer_match");
    expect(incoming?.autoSourceId).toBe(out?.id ?? "missing");
    expect(out?.editedAt).toBeNull();
    expect(db.select().from(transactions).all().filter((row) => row.mirror && row.amount === 5_000)).toHaveLength(0);
    expect(review(db, out?.id ?? "")?.level).toBe("sure");
    expect(review(db, incoming?.id ?? "")?.level).toBe("sure");
  });
});

test("a pair without a learned transfer payee asks", () => {
  withBook((db, ids) => {
    pairImport(db, ids, "MOVE TO SAVINGS", "FROM EVERYDAY");
    const [out] = rowsOf(db, -5_000);
    expect(out?.transferPeerId).toBeNull();
    expect(review(db, out?.id ?? "")?.question).toBe("transfer_pair");
  });
});

test("two candidates ask and do not link", () => {
  withBook((db, ids) => {
    learnTransfer(db, ids, "MOVE TO SAVINGS");
    statement(db, ids, ids.cheque, "out", ["03/10/2026,MOVE TO SAVINGS,-50.00"]);
    statement(db, ids, ids.savings, "in", ["03/11/2026,FROM EVERYDAY,50.00", "03/12/2026,DEPOSIT,50.00"]);
    for (const row of [...rowsOf(db, -5_000), ...rowsOf(db, 5_000)]) {
      expect(row.transferPeerId).toBeNull();
      expect(row.autoReason).toBeNull();
    }
  });
});

test("Not a transfer unlinks the pair, records the no and stays answered", () => {
  withBook((db, ids) => {
    learnTransfer(db, ids, "MOVE TO SAVINGS");
    pairImport(db, ids, "MOVE TO SAVINGS", "FROM EVERYDAY");
    const [out] = rowsOf(db, -5_000);
    const [incoming] = rowsOf(db, 5_000);
    updateTransaction(db, out?.id ?? "", {
      accountId: ids.cheque,
      date: "2026-03-10",
      amount: -5_000,
      payeeRaw: "MOVE TO SAVINGS",
      status: "cleared",
      lines: [{ amount: -5_000, categoryId: ids.other }],
      ...saved,
    });
    const key = [out?.id ?? "", incoming?.id ?? ""].sort().join(":");
    expect(db.select().from(inboxDecisions).where(eq(inboxDecisions.itemKey, `transfer_pair:${key}`)).get()?.decision).toBe("not_transfer");
    const peer = getTransaction(db, incoming?.id ?? "");
    expect(peer?.transferPeerId).toBeNull();
    expect(peer?.autoReason).toBeNull();
    expect(review(db, incoming?.id ?? "")?.question).not.toBe("transfer_pair");
  });
});

test("an automatic pair does not teach until the person confirms it", () => {
  withBook((db, ids) => {
    learnTransfer(db, ids, "MOVE TO SAVINGS");
    pairImport(db, ids, "MOVE TO SAVINGS", "FROM EVERYDAY");
    expect(loadMatchBook(db).transfersByPayee.has("FROM EVERYDAY")).toBe(false);
    const [incoming] = rowsOf(db, 5_000);
    acceptLooksRight(db, incoming?.id ?? "", saved);
    expect(loadMatchBook(db).transfersByPayee.has("FROM EVERYDAY")).toBe(true);
    const [out] = rowsOf(db, -5_000);
    expect(out?.autoReason).toBeNull();
  });
});

test("undoing the import removes an automatic pair row and frees the other", () => {
  withBook((db, ids) => {
    learnTransfer(db, ids, "MOVE TO SAVINGS");
    const batch = pairImport(db, ids, "MOVE TO SAVINGS", "FROM EVERYDAY");
    const result = undoImportBatch(db, batch.id, saved);
    expect(result.blocked).toEqual([]);
    expect(rowsOf(db, 5_000)).toHaveLength(0);
    const [out] = rowsOf(db, -5_000);
    expect(out?.transferPeerId).toBeNull();
    expect(out?.autoReason).toBeNull();
  });
});

function refundOf(db: Db, ids: Ids, date: string, amount: number, categoryId: string, payeeRaw: string) {
  const row = createTransaction(db, {
    accountId: ids.cheque,
    date,
    amount,
    payeeRaw,
    status: "cleared",
    lines: [{ amount }],
    ...saved,
  });
  applyInboxGroup(db, {
    accountId: ids.cheque,
    transactionIds: [row.id],
    categoryId,
    transferAccountId: null,
    merchantId: null,
    ...saved,
  });
  return row;
}

function fee(db: Db, ids: Ids) {
  return createTransaction(db, {
    accountId: ids.cheque,
    date: "2026-03-01",
    amount: -1_795,
    payeeRaw: "MONTHLY ACCOUNT FEE",
    status: "cleared",
    lines: [{ amount: -1_795, categoryId: ids.fees }],
    ...saved,
  });
}

test("a fee and a same-day rebate with other payees link", () => {
  withBook((db, ids) => {
    const charge = fee(db, ids);
    const rebate = refundOf(db, ids, "2026-03-01", 1_795, ids.fees, "ACCT BAL REBATE");
    const stored = getTransaction(db, rebate.id);
    expect(stored?.refundOfId).toBe(charge.id);
    expect(stored?.autoReason).toBe("refund_reversal");
    expect(review(db, rebate.id)?.level).toBe("sure");
  });
});

test("a rebate 3 days later links and 4 days later does not", () => {
  withBook((db, ids) => {
    const charge = fee(db, ids);
    const near = refundOf(db, ids, "2026-03-04", 1_795, ids.fees, "ACCT BAL REBATE");
    expect(getTransaction(db, near.id)?.refundOfId).toBe(charge.id);
  });
  withBook((db, ids) => {
    fee(db, ids);
    const late = refundOf(db, ids, "2026-03-05", 1_795, ids.fees, "ACCT BAL REBATE");
    expect(getTransaction(db, late.id)?.refundOfId).toBeNull();
    expect(review(db, late.id)?.question).not.toBe("refund_purchase");
  });
});

test("a rebate in another category does not link", () => {
  withBook((db, ids) => {
    fee(db, ids);
    const rebate = refundOf(db, ids, "2026-03-01", 1_795, ids.other, "ACCT BAL REBATE");
    expect(getTransaction(db, rebate.id)?.refundOfId).toBeNull();
    expect(review(db, rebate.id)?.question).not.toBe("refund_purchase");
  });
});

test("two same-day fees of the same amount ask which one", () => {
  withBook((db, ids) => {
    fee(db, ids);
    fee(db, ids);
    const rebate = refundOf(db, ids, "2026-03-01", 1_795, ids.fees, "ACCT BAL REBATE");
    expect(getTransaction(db, rebate.id)?.refundOfId).toBeNull();
    expect(review(db, rebate.id)?.question).toBe("refund_purchase");
  });
});

test("confirming one pair links the other open pairs of the same payee, except a recorded no", () => {
  withBook((db, ids) => {
    const dates = ["02/03", "02/17", "03/03", "03/10"];
    statement(db, ids, ids.cheque, "out", dates.map((day) => `${day}/2026,CIBC PAYMENT,-50.00`));
    statement(db, ids, ids.savings, "in", dates.map((day) => `${day}/2026,PAYMENT RECEIVED,50.00`));
    const outs = rowsOf(db, -5_000).sort((a, b) => a.date.localeCompare(b.date));
    const ins = rowsOf(db, 5_000).sort((a, b) => a.date.localeCompare(b.date));
    expect(outs.every((row) => row.transferPeerId === null)).toBe(true);
    const skipped = [outs[1]?.id ?? "", ins[1]?.id ?? ""].sort();
    decideInboxItem(db, asOf, `transfer_pair:${skipped.join(":")}`, "not_transfer", saved);
    acceptTransferPair(db, asOf, outs[0]?.id ?? "", ins[0]?.id ?? "", saved);
    for (const index of [2, 3]) {
      const out = getTransaction(db, outs[index]?.id ?? "");
      expect(out?.transferPeerId).toBe(ins[index]?.id ?? "missing");
      expect(out?.autoReason).toBe("transfer_match");
      expect(review(db, outs[index]?.id ?? "")?.level).toBe("sure");
    }
    expect(getTransaction(db, outs[1]?.id ?? "")?.transferPeerId).toBeNull();
  });
});

test("undoing the second import and then the first both work", () => {
  withBook((db, ids) => {
    learnTransfer(db, ids, "MOVE TO SAVINGS");
    const batch = pairImport(db, ids, "MOVE TO SAVINGS", "FROM EVERYDAY");
    expect(undoImportBatch(db, batch.id, saved).blocked).toEqual([]);
    const [out] = rowsOf(db, -5_000);
    expect(out?.editedAt).toBeNull();
    expect(undoImportBatch(db, batch.outId, saved).blocked).toEqual([]);
    expect(rowsOf(db, -5_000)).toHaveLength(0);
  });
});

test("undo is blocked when the linked peer is reconciled", () => {
  withBook((db, ids) => {
    learnTransfer(db, ids, "MOVE TO SAVINGS");
    const batch = pairImport(db, ids, "MOVE TO SAVINGS", "FROM EVERYDAY");
    db.insert(checkpoints).values({ id: crypto.randomUUID(), accountId: ids.savings, date: "2026-03-15", statementBalance: 0, createdAt: at }).run();
    const result = undoImportBatch(db, batch.outId, saved);
    expect(result.blocked.map((item) => item.reason)).toEqual(["reconciled"]);
    expect(rowsOf(db, -5_000)).toHaveLength(1);
    expect(rowsOf(db, -5_000)[0]?.transferPeerId).not.toBeNull();
  });
});

test("a group answer does not auto-link rows of its own batch", () => {
  withBook((db, ids) => {
    const dates = ["01/05", "01/12", "01/19", "01/26", "02/02"];
    statement(db, ids, ids.cheque, "out", dates.map((day) => `${day}/2026,CIBC PAYMENT,-50.00`));
    statement(db, ids, ids.savings, "in", dates.map((day) => `${day}/2026,PAYMENT RECEIVED,50.00`));
    const outs = rowsOf(db, -5_000).sort((a, b) => a.date.localeCompare(b.date));
    const result = applyInboxGroup(db, {
      accountId: ids.cheque,
      transactionIds: outs.map((row) => row.id),
      categoryId: null,
      transferAccountId: ids.savings,
      merchantId: null,
      ...saved,
    });
    expect(result.applied).toBe(5);
    for (const row of outs) {
      const stored = getTransaction(db, row.id);
      expect(stored?.transferPeerId).not.toBeNull();
      expect(stored?.autoReason).toBeNull();
    }
  });
});

test("Approve all Sure confirms an automatic pair as one transfer", () => {
  withBook((db, ids) => {
    learnTransfer(db, ids, "MOVE TO SAVINGS");
    pairImport(db, ids, "MOVE TO SAVINGS", "FROM EVERYDAY");
    const result = approveFiltered(db, asOf, { uncategorized: false, automatic: false }, "sure", 2, saved);
    expect(result.count).toBe(2);
    expect(rowsOf(db, -5_000)[0]?.autoReason).toBeNull();
    expect(rowsOf(db, 5_000)[0]?.autoReason).toBeNull();
  });
});
