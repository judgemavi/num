import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase, settings } from "@num/db";
import type { AccountKind, ErrorCode, TransactionLineInput, TransactionStatus } from "@num/shared";
import { expect, test } from "bun:test";
import { createDb, type Db } from "../db";
import { ServiceError } from "../service-error";
import { archiveAccount, createAccount } from "./accounts";
import { createCategory } from "./categories";
import { createTransaction, getTransaction, updateTransaction } from "./transactions";

function tempDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "num-transaction-guards-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const db = createDb(sqlite);
  db.insert(settings).values({ key: "currency", value: "CAD" }).run();
  return {
    db,
    close() {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const at = "2026-10-07T16:00:00Z";
const saved = { source: "ui" as const, at };

function expectCode(run: () => void, code: ErrorCode) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ServiceError);
    expect((error as ServiceError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}`);
}

function account(db: Db, name: string, kind: AccountKind) {
  return createAccount(db, {
    name,
    kind,
    openingDate: "2026-01-01",
    openingBalance: 0,
    ...saved,
  });
}

function lines(accountId: string, amount: number, items: TransactionLineInput[], status: TransactionStatus = "open") {
  return {
    accountId,
    date: "2026-04-01",
    amount,
    payeeRaw: "Example shop",
    status,
    lines: items,
    ...saved,
  };
}

test("a mirror amount change is rejected when the source has more than one line", () => {
  const book = tempDatabase();
  try {
    const chequing = account(book.db, "Chequing", "chequing");
    const mortgage = account(book.db, "Mortgage", "mortgage");
    const interest = createCategory(book.db, { name: "Interest", kind: "expense", ...saved });
    const created = createTransaction(
      book.db,
      lines(chequing.id, -1_500_000, [
        { amount: -1_200_000, transferAccountId: mortgage.id },
        { amount: -300_000, categoryId: interest.id, memo: "Interest" },
      ]),
    );
    const mirror = getTransaction(book.db, created.transferPeerId ?? "");
    if (!mirror) {
      throw new Error("Transfer peer is missing");
    }
    expectCode(
      () =>
        updateTransaction(
          book.db,
          mirror.id,
          lines(mortgage.id, 1_000_000, [{ amount: 1_000_000, transferAccountId: chequing.id }]),
        ),
      "mirror_amount_locked",
    );
    expect(getTransaction(book.db, created.id)?.amount).toBe(-1_500_000);
    expect(getTransaction(book.db, mirror.id)?.amount).toBe(1_200_000);

    const edited = updateTransaction(book.db, mirror.id, {
      ...lines(mortgage.id, 1_200_000, [{ amount: 1_200_000, transferAccountId: chequing.id }], "open"),
      date: "2026-04-02",
      notes: "Principal",
    });
    expect(edited.amount).toBe(1_200_000);
    expect(edited.date).toBe("2026-04-02");
    expect(edited.notes).toBe("Principal");
    expect(edited.transferPeerId).toBeNull();
    const source = getTransaction(book.db, created.id);
    expect(source?.amount).toBe(-1_500_000);
    expect(source?.date).toBe("2026-04-01");
    expect(source?.notes).toBeNull();
    expect(source?.transferPeerId).toBeNull();
    expect(source?.lines.map((line) => line.amount)).toEqual([-1_200_000, -300_000]);
    expect(source?.lines[0]?.transferAccountId).toBeNull();

    const corrected = updateTransaction(
      book.db,
      created.id,
      lines(
        chequing.id,
        -1_300_000,
        [
          { amount: -1_000_000, transferAccountId: mortgage.id },
          { amount: -300_000, categoryId: interest.id, memo: "Interest" },
        ],
        "cleared",
      ),
    );
    expect(corrected.amount).toBe(-1_300_000);
    expect(corrected.status).toBe("cleared");
    const nextMirror = getTransaction(book.db, corrected.transferPeerId ?? "");
    expect(nextMirror?.id).not.toBe(mirror.id);
    expect(nextMirror?.mirror).toBe(true);
    expect(nextMirror?.amount).toBe(1_000_000);
    expect(nextMirror?.status).toBe("open");
    expect(nextMirror?.lines).toHaveLength(1);
  } finally {
    book.close();
  }
});

test("a new mirror starts open", () => {
  const book = tempDatabase();
  try {
    const chequing = account(book.db, "Chequing", "chequing");
    const savings = account(book.db, "Savings", "savings");
    const created = createTransaction(
      book.db,
      lines(chequing.id, -50_000, [{ amount: -50_000, transferAccountId: savings.id }], "cleared"),
    );
    const mirror = getTransaction(book.db, created.transferPeerId ?? "");
    if (!mirror) {
      throw new Error("Transfer peer is missing");
    }
    expect(created.status).toBe("cleared");
    expect(mirror.status).toBe("open");

    const clearedMirror = updateTransaction(
      book.db,
      mirror.id,
      lines(savings.id, 50_000, [{ amount: 50_000, transferAccountId: chequing.id }], "cleared"),
    );
    expect(clearedMirror.status).toBe("cleared");
    expect(getTransaction(book.db, created.id)?.status).toBe("cleared");

    const edited = updateTransaction(
      book.db,
      created.id,
      lines(chequing.id, -50_000, [{ amount: -50_000, transferAccountId: savings.id }], "open"),
    );
    expect(edited.status).toBe("open");
    expect(getTransaction(book.db, mirror.id)?.status).toBe("cleared");
  } finally {
    book.close();
  }
});

test("status reconciled is rejected on create", () => {
  const book = tempDatabase();
  try {
    const cash = account(book.db, "Cash", "cash");
    const body = lines(cash.id, -100, [{ amount: -100 }]);
    expectCode(() => createTransaction(book.db, { ...body, status: "reconciled" }), "transaction_status_invalid");
  } finally {
    book.close();
  }
});

test("an archived account is rejected", () => {
  const book = tempDatabase();
  try {
    const chequing = account(book.db, "Chequing", "chequing");
    const savings = account(book.db, "Savings", "savings");
    const closed = account(book.db, "Closed", "cash");
    archiveAccount(book.db, closed.id, { confirm: false, ...saved });

    expectCode(
      () => createTransaction(book.db, lines(closed.id, -100, [{ amount: -100 }])),
      "account_archived",
    );
    const created = createTransaction(book.db, lines(chequing.id, -100, [{ amount: -100 }]));
    expectCode(
      () => updateTransaction(book.db, created.id, lines(closed.id, -100, [{ amount: -100 }])),
      "account_archived",
    );
    expect(getTransaction(book.db, created.id)?.accountId).toBe(chequing.id);

    expectCode(
      () =>
        createTransaction(
          book.db,
          lines(chequing.id, -200, [{ amount: -200, transferAccountId: closed.id }]),
        ),
      "account_archived",
    );
    const transfer = createTransaction(
      book.db,
      lines(chequing.id, -200, [{ amount: -200, transferAccountId: savings.id }]),
    );
    expectCode(
      () =>
        updateTransaction(
          book.db,
          transfer.id,
          lines(chequing.id, -200, [{ amount: -200, transferAccountId: closed.id }]),
        ),
      "account_archived",
    );
    expect(getTransaction(book.db, transfer.transferPeerId ?? "")?.accountId).toBe(savings.id);
    expect(getTransaction(book.db, transfer.id)?.amount).toBe(-200);
  } finally {
    book.close();
  }
});
