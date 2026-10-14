import { Temporal, dayDistance, type CheckpointHelp } from "@num/shared";

const unclearedWindowDays = 7;
const duplicateWindowDays = 3;
const gapMinDays = 7;

export type HelpTransaction = {
  id: string;
  date: string;
  amount: number;
  status: string;
  payee: string;
};

function inWindow(row: HelpTransaction, openingDate: string, statementDate: string) {
  return row.date >= openingDate && row.date <= statementDate;
}

function addDays(iso: string, days: number) {
  return Temporal.PlainDate.from(iso).add({ days }).toString();
}

function spanDays(from: string, to: string) {
  return dayDistance(from, to) + 1;
}

function byDateThenId(left: HelpTransaction, right: HelpTransaction): number {
  if (left.date < right.date) {
    return -1;
  }
  if (left.date > right.date) {
    return 1;
  }
  if (left.id < right.id) {
    return -1;
  }
  if (left.id > right.id) {
    return 1;
  }
  return 0;
}

function gaps(openingDate: string, statementDate: string, dates: string[]) {
  if (statementDate < openingDate) {
    return [];
  }
  const found: CheckpointHelp[] = [];
  const bounds = [...dates, addDays(statementDate, 1)];
  let cursor = openingDate;
  for (const bound of bounds) {
    const gapEnd = addDays(bound, -1);
    if (cursor <= gapEnd && spanDays(cursor, gapEnd) >= gapMinDays) {
      found.push({ code: "gap", from: cursor, to: gapEnd });
    }
    cursor = addDays(bound, 1);
  }
  return found;
}

export function checkpointHelp(input: {
  openingDate: string;
  statementDate: string;
  transactions: HelpTransaction[];
}): CheckpointHelp[] {
  const rows = input.transactions.filter((row) => inWindow(row, input.openingDate, input.statementDate)).sort(byDateThenId);
  const help: CheckpointHelp[] = [];

  for (const row of rows) {
    if (row.status === "open" && dayDistance(row.date, input.statementDate) <= unclearedWindowDays) {
      help.push({
        code: "uncleared",
        transaction: { id: row.id, date: row.date, payee: row.payee, amount: row.amount },
      });
    }
  }

  const byAmount = new Map<number, HelpTransaction[]>();
  for (const row of rows) {
    const group = byAmount.get(row.amount);
    if (group) {
      group.push(row);
    } else {
      byAmount.set(row.amount, [row]);
    }
  }

  const amounts = [...byAmount.keys()].sort((left, right) => left - right);
  for (const amount of amounts) {
    const group = byAmount.get(amount) ?? [];
    for (let index = 0; index < group.length; index += 1) {
      const left = group[index];
      if (!left) {
        continue;
      }
      for (let next = index + 1; next < group.length; next += 1) {
        const right = group[next];
        if (!right) {
          continue;
        }
        if (dayDistance(left.date, right.date) > duplicateWindowDays) {
          break;
        }
        help.push({
          code: "duplicate",
          transactions: [
            { id: left.id, date: left.date, payee: left.payee, amount: left.amount },
            { id: right.id, date: right.date, payee: right.payee, amount: right.amount },
          ],
        });
      }
    }
  }

  const inside = rows
    .map((row) => row.date)
    .filter((date) => date >= input.openingDate && date <= input.statementDate);
  help.push(...gaps(input.openingDate, input.statementDate, [...new Set(inside)].sort()));
  return help;
}
