import { isIsoDate, type ColumnMap, type SignConvention } from "@num/shared";
import { parseMinorAmount } from "./parse-amount";
import type { ParsedStatement, StatementRow } from "./statement";

type BalanceRow = {
  date: string;
  balance: number;
  index: number;
};

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

function rowAmount(cells: string[], map: ColumnMap, digits: number): number | null {
  if (map.debit != null || map.credit != null) {
    const debit = map.debit == null ? null : parseMinorAmount(cell(cells, map.debit), digits);
    const credit = map.credit == null ? null : parseMinorAmount(cell(cells, map.credit), digits);
    if (debit === null && credit === null) {
      return null;
    }
    const out = debit === null ? 0 : Math.abs(debit);
    const inn = credit === null ? 0 : Math.abs(credit);
    if (out === 0 && inn === 0) {
      return null;
    }
    return inn - out;
  }

  if (map.amount == null) {
    return null;
  }
  const amount = parseMinorAmount(cell(cells, map.amount), digits);
  if (amount === null) {
    return null;
  }
  return applySign(amount, map.signConvention);
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
  const lines = stripBom(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const start = map.hasHeader ? 1 : 0;
  const rows: StatementRow[] = [];
  const balances: BalanceRow[] = [];

  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) {
      continue;
    }
    const cells = splitCsvLine(line);
    const date = toIsoDate(cell(cells, map.date), map.dateOrder);
    if (!date) {
      continue;
    }
    const amount = rowAmount(cells, map, minorDigits);
    if (amount === null) {
      continue;
    }
    const bankId = cell(cells, map.bankId).trim();
    rows.push({
      date,
      description: cell(cells, map.description).trim(),
      amount,
      bankId: bankId.length > 0 ? bankId : null,
    });

    if (map.balance != null) {
      const balance = parseMinorAmount(cell(cells, map.balance), minorDigits);
      if (balance !== null) {
        balances.push({
          date,
          balance: applySign(balance, map.balanceSign ?? map.signConvention),
          index,
        });
      }
    }
  }

  const newestFirst = rows.length > 1 && rows[0]!.date > rows[rows.length - 1]!.date;
  const end = closing(balances, newestFirst);
  return {
    rows,
    closingBalance: end?.balance ?? null,
    closingDate: end?.date ?? null,
  };
}
