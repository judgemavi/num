import { addDays } from "@num/shared";
import type { FillEvent } from "./funding-covers";
import { bucketBalances } from "./bucket-balance";
import { readEmergencyFund } from "./emergency-fund";
import { positionOn } from "./funding-book";
import { monthlyRows } from "./funding-months";
import type { Reader } from "./write";

/** Reads shared by one calculation. Each date keeps its own balances. Do not retain this object after a write. */
export function createFundingReads(db: Reader, asOf: string, projected: readonly FillEvent[] = []) {
  const balances = new Map<string | undefined, ReturnType<typeof bucketBalances>>();
  const months = new Map<string, ReturnType<typeof monthlyRows>>();
  let fund: ReturnType<typeof readEmergencyFund> | undefined;
  function balancesOn(date?: string) {
    let found = balances.get(date);
    if (!found) {
      found = bucketBalances(db, date);
      if (date === undefined || date >= `${asOf.slice(0, 7)}-01`) {
        for (const event of projected) {
          const amount = event.kind === "recede" ? -event.amount : event.amount;
          found.set(event.bucketId, (found.get(event.bucketId) ?? 0) + amount);
        }
      }
      balances.set(date, found);
    }
    return found;
  }
  function emergencyFund() {
    if (fund === undefined) {
      fund = readEmergencyFund(db, asOf, balancesOn(asOf));
    }
    return fund;
  }
  return {
    position: positionOn(db, asOf, balancesOn(asOf)),
    balancesOn,
    emergencyFund,
    monthlyRows(month = asOf.slice(0, 7)) {
      let found = months.get(month);
      if (!found) {
        const date = month > asOf.slice(0, 7) ? asOf : addDays(`${month}-01`, -1);
        found = monthlyRows(db, asOf, month, {
          balances: balancesOn(date),
          emergencyFund,
          covers: month === asOf.slice(0, 7) ? projected.filter((event) => event.kind === "cover") : [],
        });
        months.set(month, found);
      }
      return found;
    },
  };
}

export type FundingReads = ReturnType<typeof createFundingReads>;
