import { isIsoDate } from "@num/shared";
import { parseMinorAmount } from "./parse-amount";
import type { ParsedStatement, StatementRow } from "./statement";

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function sections(text: string, tag: string): string[] {
  const pattern = new RegExp(`<${tag}>`, "gi");
  const starts: number[] = [];
  for (const match of text.matchAll(pattern)) {
    if (match.index !== undefined) {
      starts.push(match.index + match[0].length);
    }
  }

  const closePattern = new RegExp(`</${tag}>`, "i");
  return starts.map((start, index) => {
    const next = starts[index + 1] ?? text.length;
    const close = text.slice(start, next).search(closePattern);
    const end = close >= 0 ? start + close : next;
    return text.slice(start, end);
  });
}

function tagValue(block: string, tag: string): string | null {
  const match = new RegExp(`<${tag}>\\s*([^<\\r\\n]*)`, "i").exec(block);
  const value = match?.[1]?.trim() ?? "";
  return value.length > 0 ? value : null;
}

function isoDate(raw: string | null): string | null {
  if (!raw) {
    return null;
  }
  const digits = /^(\d{4})(\d{2})(\d{2})/.exec(raw);
  if (!digits) {
    return null;
  }
  const iso = `${digits[1]}-${digits[2]}-${digits[3]}`;
  return isIsoDate(iso) ? iso : null;
}

function description(block: string): string {
  return tagValue(block, "NAME") ?? tagValue(block, "MEMO") ?? "";
}

export function parseOfxStatement(text: string, minorDigits: number): ParsedStatement {
  const source = stripBom(text);
  if (!/<OFX|<STMTTRN/i.test(source)) {
    throw new Error("File is not OFX");
  }

  const rows: StatementRow[] = [];
  for (const block of sections(source, "STMTTRN")) {
    const date = isoDate(tagValue(block, "DTPOSTED"));
    const amountText = tagValue(block, "TRNAMT");
    if (!date || amountText === null) {
      continue;
    }
    const amount = parseMinorAmount(amountText, minorDigits);
    if (amount === null) {
      continue;
    }
    rows.push({
      date,
      description: description(block),
      amount,
      bankId: tagValue(block, "FITID"),
    });
  }

  const ledger = sections(source, "LEDGERBAL")[0];
  const balanceText = ledger ? tagValue(ledger, "BALAMT") : null;
  const closingBalance = balanceText === null ? null : parseMinorAmount(balanceText, minorDigits);
  const closingDate = ledger ? isoDate(tagValue(ledger, "DTASOF")) : null;

  return { rows, closingBalance, closingDate };
}
