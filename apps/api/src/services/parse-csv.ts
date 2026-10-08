import { isIsoDate, type ColumnMap, type DecimalSeparator, type SignConvention } from "@num/shared";
import { readMinorAmount, type AmountProblem } from "./parse-amount";
import type { ParsedStatement, StatementRow, UnreadableReason, UnreadableRow } from "./statement";

type BalanceRow = {
  date: string;
  balance: number;
  index: number;
};

type ReadRow =
  | { ok: true; row: StatementRow; balance: number | null }
  | { ok: false; reason: UnreadableReason };

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === undefined) {
      break;
    }
    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function toIsoDate(raw: string, order: ColumnMap["dateOrder"]): string | null {
  const text = raw.trim();
  if (isIsoDate(text)) {
    return text;
  }

  const match = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(text);
  if (!match) {
    return null;
  }

  const yearPart = match[3];
  const firstPart = match[1];
  const secondPart = match[2];
  if (yearPart === undefined || firstPart === undefined || secondPart === undefined) {
    return null;
  }

  let year = Number(yearPart);
  if (year < 100) {
    year += 2000;
  }
  const first = Number(firstPart);
  const second = Number(secondPart);
  const month = order === "mdy" ? first : second;
  const day = order === "mdy" ? second : first;
  const iso = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  return isIsoDate(iso) ? iso : null;
}

function cell(cells: string[], index: number | null | undefined): string {
  if (index == null) {
    return "";
  }
  return cells[index] ?? "";
}

function applySign(amount: number, convention: SignConvention): number {
  return convention === "inverted" ? -amount : amount;
}

function money(
  raw: string,
  digits: number,
  decimal: DecimalSeparator,
): { ok: true; minor: number | null } | { ok: false; reason: AmountProblem } {
  const read = readMinorAmount(raw, digits, decimal);
  if (read.kind === "empty") {
    return { ok: true, minor: null };
  }
  if (read.kind === "error") {
    return { ok: false, reason: read.reason };
  }
  return { ok: true, minor: read.minor };
}

function rowAmount(
  cells: string[],
  map: ColumnMap,
  digits: number,
  decimal: DecimalSeparator,
): { ok: true; amount: number } | { ok: false; reason: AmountProblem } {
  if (map.debit != null || map.credit != null) {
    const debit = map.debit == null ? { ok: true as const, minor: null } : money(cell(cells, map.debit), digits, decimal);
    if (!debit.ok) {
      return debit;
    }
    const credit = map.credit == null ? { ok: true as const, minor: null } : money(cell(cells, map.credit), digits, decimal);
    if (!credit.ok) {
      return credit;
    }
    if (debit.minor === null && credit.minor === null) {
      return { ok: false, reason: "amount_unreadable" };
    }
    const out = debit.minor === null ? 0 : Math.abs(debit.minor);
    const inn = credit.minor === null ? 0 : Math.abs(credit.minor);
    return { ok: true, amount: inn - out };
  }

  const read = money(cell(cells, map.amount), digits, decimal);
  if (!read.ok) {
    return read;
  }
  if (read.minor === null) {
    return { ok: false, reason: "amount_unreadable" };
  }
  return { ok: true, amount: applySign(read.minor, map.signConvention) };
}

function readRow(cells: string[], map: ColumnMap, digits: number): ReadRow {
  const date = toIsoDate(cell(cells, map.date), map.dateOrder);
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
    if (read.minor !== null) {
      balance = applySign(read.minor, map.balanceSign ?? map.signConvention);
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

function closing(rows: BalanceRow[], newestFirst: boolean): BalanceRow | null {
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

export function parseCsvStatement(text: string, map: ColumnMap, minorDigits: number): ParsedStatement {
  const lines = stripBom(text).split(/\r?\n/);
  const rows: StatementRow[] = [];
  const unreadable: UnreadableRow[] = [];
  const balances: BalanceRow[] = [];
  let headerPending = map.hasHeader;

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] ?? "";
    if (raw.trim().length === 0) {
      continue;
    }
    if (headerPending) {
      headerPending = false;
      continue;
    }

    const parsed = readRow(splitCsvLine(raw), map, minorDigits);
    if (!parsed.ok) {
      unreadable.push({ line: index + 1, raw, reason: parsed.reason });
      continue;
    }
    rows.push(parsed.row);
    if (parsed.balance !== null) {
      balances.push({ date: parsed.row.date, balance: parsed.balance, index });
    }
  }

  const newestFirst = rows.length > 1 && rows[0]!.date > rows[rows.length - 1]!.date;
  const end = closing(balances, newestFirst);
  return {
    rows,
    unreadable,
    closingBalance: end?.balance ?? null,
    closingDate: end?.date ?? null,
  };
}
