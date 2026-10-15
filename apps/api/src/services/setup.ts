import { categories, categoryGroups, settings } from "@num/db";
import { foldName, currencyDigits, isIsoDate, type CategorySet, type CurrencyCode } from "@num/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { insertEmergencyBucket } from "./buckets";
import { defaultCategoryGroups } from "./default-categories";
import { write, type AuditSource, type WriteTx } from "./write";

const settingDefaults = [["staleImportDays", "10"]] as const;

type SetupInput = {
  currency: string;
  categorySet: CategorySet;
  /** The date of the setup: the start date of the emergency bucket. */
  asOf: string;
  source: AuditSource;
  at?: string;
};

type CurrencyInput = {
  currency: string;
  source: AuditSource;
  at?: string;
};

function assertCurrency(code: string): asserts code is CurrencyCode {
  if (currencyDigits(code) === undefined) {
    throw new ServiceError("invalid_body", 400, { field: "currency" });
  }
}

function currencyRow(tx: WriteTx) {
  return tx.select().from(settings).where(eq(settings.key, "currency")).get();
}

function insertSetting(tx: WriteTx, key: (typeof settings.$inferInsert)["key"], value: string) {
  const existing = tx.select().from(settings).where(eq(settings.key, key)).get();
  if (existing) {
    return;
  }
  tx.insert(settings).values({ key, value }).run();
  tx.audit({
    entity: "settings",
    entityId: key,
    action: "create",
    before: null,
    after: { key, value },
  });
}

function insertDefaultCategories(tx: WriteTx) {
  for (const group of defaultCategoryGroups) {
    const groupId = crypto.randomUUID();
    tx.insert(categoryGroups).values({ id: groupId, name: group.name, sortKey: foldName(group.name) }).run();
    tx.audit({
      entity: "category_groups",
      entityId: groupId,
      action: "create",
      before: null,
      after: { name: group.name },
    });

    for (const category of group.categories) {
      const id = crypto.randomUUID();
      tx.insert(categories)
        .values({
          id,
          name: category.name,
          sortKey: foldName(category.name),
          kind: category.kind,
          groupId,
          essential: category.essential,
        })
        .run();
      tx.audit({
        entity: "categories",
        entityId: id,
        action: "create",
        before: null,
        after: {
          name: category.name,
          kind: category.kind,
          groupId,
          essential: category.essential,
        },
      });
    }
  }
}

export function bookCurrency(db: Db): { currency: CurrencyCode } {
  const row = db.select().from(settings).where(eq(settings.key, "currency")).get();
  if (!row) {
    throw new ServiceError("setup_required", 409);
  }
  assertCurrency(row.value);
  return { currency: row.value };
}

export function setupStatus(db: Db): { complete: boolean } {
  const row = db.select({ key: settings.key }).from(settings).where(eq(settings.key, "currency")).get();
  return { complete: row !== undefined };
}

export function runSetup(db: Db, input: SetupInput): { currency: CurrencyCode; categorySet: CategorySet } {
  assertCurrency(input.currency);
  if (!isIsoDate(input.asOf)) {
    throw new ServiceError("as_of_invalid", 400, { asOf: input.asOf });
  }
  const currency = input.currency;
  write(db, { source: input.source, at: input.at }, (tx) => {
    if (currencyRow(tx)) {
      throw new ServiceError("setup_already_complete", 409);
    }
    insertSetting(tx, "currency", currency);
    for (const [key, value] of settingDefaults) {
      insertSetting(tx, key, value);
    }
    if (input.categorySet === "default") {
      insertDefaultCategories(tx);
    }
    insertEmergencyBucket(tx, input.asOf);
  });
  return { currency, categorySet: input.categorySet };
}

/** A change of the book currency is a relabel. Stored amounts do not change. */
export function changeCurrency(db: Db, input: CurrencyInput): { currency: CurrencyCode } {
  assertCurrency(input.currency);
  const currency = input.currency;
  const current = db.select().from(settings).where(eq(settings.key, "currency")).get();
  if (!current) {
    throw new ServiceError("setup_required", 409);
  }
  if (current.value === currency) {
    return { currency };
  }

  write(db, { source: input.source, at: input.at }, (tx) => {
    const row = currencyRow(tx);
    if (!row) {
      throw new ServiceError("setup_required", 409);
    }
    tx.update(settings).set({ value: currency }).where(eq(settings.key, "currency")).run();
    tx.audit({
      entity: "settings",
      entityId: "currency",
      action: "update",
      before: { value: row.value },
      after: { value: currency },
    });
  });
  return { currency };
}
