import { accounts } from "@num/db";
import { accountClass, accountKinds, type AccountKind } from "@num/shared";
import type { Db } from "../db";
import { balanceOf } from "./account-balance";

export type MonthPoint = {
  month: string;
  date: string;
};

export function asKind(value: string): AccountKind {
  if (!(accountKinds as readonly string[]).includes(value)) {
    throw new Error("Unknown account kind");
  }
  return value as AccountKind;
}

export function netWorthSeries(
  db: Db,
  points: readonly MonthPoint[],
): { month: string; date: string; assets: number; liabilities: number; net: number }[] {
  const accountRows = db
    .select()
    .from(accounts)
    .all()
    .map((row) => ({
      id: row.id,
      kind: asKind(row.kind),
      openingBalance: row.openingBalance,
    }));
  return points.map((point) => {
    let assets = 0;
    let liabilities = 0;
    for (const account of accountRows) {
      const balance = balanceOf(db, account, undefined, undefined, point.date);
      if (accountClass(account.kind) === "liability") {
        if (balance < 0) {
          liabilities += -balance;
        } else {
          assets += balance;
        }
      } else {
        assets += balance;
      }
    }
    return { month: point.month, date: point.date, assets, liabilities, net: assets - liabilities };
  });
}
