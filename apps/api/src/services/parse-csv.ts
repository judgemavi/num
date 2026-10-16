import { readAmount, splitCsvLine, statementDate, stripBom, type AmountProblem, type UnreadableReason, type UnreadableRow, type ColumnMap, type DecimalSeparator, type SignConvention } from "@num/shared";
import type { ParsedStatement, StatementRow } from "./statement";

type BalanceRow = {
  date: string;
  balance: number;
  index: number;
};

type ReadRow =
  | { ok: true; row: StatementRow; balance: number | null }
  | { ok: false; reason: UnreadableReason };

function firstContentIndex(lines: string[]) {
  for (let index = 0; index < lines.length; index += 1) {
    if ((lines[index] ?? "").trim().length > 0) {
      return index;
    }
  }
  return -1;
}

function headerIndex(lines: string[], map: ColumnMap) {
  const index = firstContentIndex(lines);
  if (index < 0 || map.hasHeader === false) {
    return -1;
  }
  if (map.hasHeader === true) {
    return index;
  }
  const date = statementDate(cell(splitCsvLine(lines[index] ?? ""), map.date), map.dateOrder);
  return date === null ? index : -1;
}

function cell(cells: string[], index: number | null | undefined) {
  if (index == null) {
    return "";
  }
  return cells[index] ?? "";
}

function applySign(amount: number, convention: SignConvention) {
  return convention === "inverted" ? -amount : amount;
}

function money(
  raw: string,
  digits: number,
  decimal: DecimalSeparator,
): { ok: true; amount: number | null } | { ok: false; reason: AmountProblem } {
  const read = readAmount(raw, digits, decimal);
  if (read.kind === "empty") {
    return { ok: true, amount: null };
  }
  if (read.kind === "error") {
    return { ok: false, reason: read.reason };
  }
  return { ok: true, amount: read.amount };
}

function rowAmount(
  cells: string[],
  map: ColumnMap,
  digits: number,
  decimal: DecimalSeparator,
): { ok: true; amount: number } | { ok: false; reason: AmountProblem } {
  if (map.debit != null || map.credit != null) {
    const debit = map.debit == null ? { ok: true as const, amount: null } : money(cell(cells, map.debit), digits, decimal);
    if (!debit.ok) {
      return debit;
    }
    const credit = map.credit == null ? { ok: true as const, amount: null } : money(cell(cells, map.credit), digits, decimal);
    if (!credit.ok) {
      return credit;
    }
    if (debit.amount === null && credit.amount === null) {
      return { ok: false, reason: "amount_unreadable" };
    }
    const out = debit.amount === null ? 0 : Math.abs(debit.amount);
    const inn = credit.amount === null ? 0 : Math.abs(credit.amount);
    return { ok: true, amount: inn - out };
  }

  const read = money(cell(cells, map.amount), digits, decimal);
  if (!read.ok) {
    return read;
  }
  if (read.amount === null) {
    return { ok: false, reason: "amount_unreadable" };
  }
  return { ok: true, amount: applySign(read.amount, map.signConvention) };
}

function readRow(cells: string[], map: ColumnMap, digits: number): ReadRow {
  const date = statementDate(cell(cells, map.date), map.dateOrder);
  if (!date) {
    return { ok: false, reason: "date_unreadable" };
  }

  const decimal = map.decimalSeparator ?? ".";
  const amount = rowAmount(cells, map, digits, decimal);
  if (!amount.ok) {
    return amount;
  }

  let balance: number | null = null;
  if (map.balance != null) {
    const read = money(cell(cells, map.balance), digits, decimal);
    if (!read.ok) {
      return read;
    }
    if (read.amount !== null) {
      balance = applySign(read.amount, map.balanceSign ?? map.signConvention);
    }
  }

  const bankId = cell(cells, map.bankId).trim();
  return {
    ok: true,
    balance,
    row: {
      date,
      description: cell(cells, map.description).trim(),
      amount: amount.amount,
      bankId: bankId.length > 0 ? bankId : null,
    },
  };
}

function closing(rows: BalanceRow[], newestFirst: boolean) {
  if (rows.length === 0) {
    return null;
  }
  const ordered = [...rows].sort((left, right) => {
    if (left.date !== right.date) {
      return left.date < right.date ? 1 : -1;
    }
    return newestFirst ? left.index - right.index : right.index - left.index;
  });
  return ordered[0] ?? null;
}

export function parseCsvStatement(text: string, map: ColumnMap, digits: number): ParsedStatement {
  const lines = stripBom(text).split(/\r?\n/);
  const rows: StatementRow[] = [];
  const rowBalances: (number | null)[] = [];
  const unreadable: UnreadableRow[] = [];
  const balances: BalanceRow[] = [];
  const header = headerIndex(lines, map);

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] ?? "";
    if (raw.trim().length === 0 || index === header) {
      continue;
    }

    const parsed = readRow(splitCsvLine(raw), map, digits);
    if (!parsed.ok) {
      unreadable.push({ line: index + 1, raw, reason: parsed.reason });
      continue;
    }
    rows.push(parsed.row);
    rowBalances.push(parsed.balance);
    if (parsed.balance !== null) {
      balances.push({ date: parsed.row.date, balance: parsed.balance, index });
    }
  }

  const first = rows.at(0);
  const last = rows.at(-1);
  const newestFirst = first !== undefined && last !== undefined && first.date > last.date;
  const end = closing(balances, newestFirst);
  return {
    rows,
    unreadable,
    closingBalance: end?.balance ?? null,
    closingDate: end?.date ?? null,
    firstRow: earliestRow(rows, rowBalances, newestFirst),
  };
}

function earliestRow(
  rows: StatementRow[],
  rowBalances: readonly (number | null)[],
  newestFirst: boolean,
) {
  if (rows.length === 0) {
    return null;
  }
  let best = 0;
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    const current = rows[best];
    if (!row || !current) {
      continue;
    }
    if (row.date < current.date || (row.date === current.date && newestFirst)) {
      best = index;
    }
  }
  const row = rows[best];
  const balance = rowBalances[best];
  if (!row || balance === null || balance === undefined) {
    return null;
  }
  return { date: row.date, amount: row.amount, balance };
}
