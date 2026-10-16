import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { accounts, migrateDatabase, openDatabase, settings, transactions } from "@num/db";
import type { AccountKind, ErrorCode, TransactionLineInput } from "@num/shared";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "../db";
import { ServiceError } from "../service-error";
import { archiveAccount, createAccount } from "./accounts";
import { createCategory } from "./categories";
import { getsImports } from "./transaction-test-book";
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
    asOf: "2026-10-07",
    name,
    kind,
    openingDate: "2026-01-01",
    openingBalance: 0,
    ...saved,
  });
}

function lines(accountId: string, amount: number, items: TransactionLineInput[]) {
  return {
    accountId,
    date: "2026-04-01",
    amount,
    payeeRaw: "Example shop",
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
      ...lines(mortgage.id, 1_200_000, [{ amount: 1_200_000, transferAccountId: chequing.id }]),
      date: "2026-04-02",
    });
    expect(edited.amount).toBe(1_200_000);
    expect(edited.date).toBe("2026-04-02");
    expect(edited.transferPeerId).toBeNull();
    const source = getTransaction(book.db, created.id);
    expect(source?.amount).toBe(-1_500_000);
    expect(source?.date).toBe("2026-04-01");
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
      ),
    );
    expect(corrected.amount).toBe(-1_300_000);
    const nextMirror = getTransaction(book.db, corrected.transferPeerId ?? "");
    expect(nextMirror?.id).not.toBe(mirror.id);
    expect(nextMirror?.mirror).toBe(true);
    expect(nextMirror?.amount).toBe(1_000_000);
    // A mortgage gets no imports: its mirror is cleared.
    expect(nextMirror?.status).toBe("cleared");
    expect(nextMirror?.lines).toHaveLength(1);
  } finally {
    book.close();
  }
});

test("a new transaction and its new mirror are open only in an account that gets imports", () => {
  const book = tempDatabase();
  try {
    const chequing = account(book.db, "Chequing", "chequing");
    const card = account(book.db, "Second chequing", "chequing");
    const savings = account(book.db, "Savings", "savings");
    const cash = account(book.db, "Cash", "cash");
    getsImports(book.db, chequing.id);
    book.db.update(accounts).set({ importPreset: "td-bank-account" }).where(eq(accounts.id, card.id)).run();

    expect(createTransaction(book.db, lines(chequing.id, -1_000, [{ amount: -1_000 }])).status).toBe("open");
    expect(createTransaction(book.db, lines(card.id, -1_000, [{ amount: -1_000 }])).status).toBe("open");
    expect(createTransaction(book.db, lines(savings.id, -1_000, [{ amount: -1_000 }])).status).toBe("cleared");

    const created = createTransaction(book.db, lines(chequing.id, -50_000, [{ amount: -50_000, transferAccountId: savings.id }]));
    const mirror = getTransaction(book.db, created.transferPeerId ?? "");
    expect(created.status).toBe("open");
    expect(mirror?.status).toBe("cleared");
    const fromCash = createTransaction(book.db, lines(cash.id, -7_000, [{ amount: -7_000, transferAccountId: card.id }]));
    expect(fromCash.status).toBe("cleared");
    expect(getTransaction(book.db, fromCash.transferPeerId ?? "")?.status).toBe("open");

    // A mirror that moves to another account takes the status of a new mirror there.
    const moved = updateTransaction(book.db, created.id, { lines: [{ amount: -50_000, transferAccountId: card.id }], ...saved });
    expect(moved.transferPeerId).toBe(mirror?.id ?? "");
    expect(getTransaction(book.db, moved.transferPeerId ?? "")?.status).toBe("open");

    // An import sets "cleared". An edit by the person does not change the status.
    book.db.update(transactions).set({ status: "cleared" }).where(eq(transactions.id, created.id)).run();
    const edited = updateTransaction(book.db, created.id, { date: "2026-04-02", ...saved });
    expect(edited.date).toBe("2026-04-02");
    expect(edited.status).toBe("cleared");
    expect(getTransaction(book.db, moved.transferPeerId ?? "")?.status).toBe("open");
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
