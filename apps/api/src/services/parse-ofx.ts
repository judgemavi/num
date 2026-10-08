import { isIsoDate } from "@num/shared";
import { readMinorAmount } from "./parse-amount";
import type { ParsedStatement, StatementRow, UnreadableReason, UnreadableRow } from "./statement";

type Block = {
  text: string;
  start: number;
  end: number;
};

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function blocks(text: string, tag: string): Block[] {
  const pattern = new RegExp(`<${tag}>`, "gi");
  const opens: { tag: number; content: number }[] = [];
  for (const match of text.matchAll(pattern)) {
    if (match.index !== undefined) {
      opens.push({ tag: match.index, content: match.index + match[0].length });
    }
  }

  const closePattern = new RegExp(`</${tag}>`, "i");
  return opens.map((open, index) => {
    const next = opens[index + 1]?.tag ?? text.length;
    const close = text.slice(open.content, next).search(closePattern);
    const end = close >= 0 ? open.content + close : next;
    return { text: text.slice(open.content, end), start: open.tag, end };
  });
}

function tagValue(block: string, tag: string): string | null {
  const match = new RegExp(`<${tag}>\\s*([^<\\r\\n]*)`, "i").exec(block);
  const value = match?.[1]?.trim() ?? "";
  return value.length > 0 ? value : null;
}

function lineNumber(source: string, index: number): number {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (source[cursor] === "\n") {
      line += 1;
    }
  }
  return line;
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

function amountProblem(raw: string | null, digits: number): { minor: number } | { reason: UnreadableReason } {
  if (raw === null) {
    return { reason: "amount_unreadable" };
  }
  const read = readMinorAmount(raw, digits, ".");
  if (read.kind === "value") {
    return { minor: read.minor };
  }
  if (read.kind === "error") {
    return { reason: read.reason };
  }
  return { reason: "amount_unreadable" };
}

export function parseOfxStatement(text: string, minorDigits: number): ParsedStatement {
  const source = stripBom(text);
  if (!/<OFX|<STMTTRN/i.test(source)) {
    throw new Error("File is not OFX");
  }

  const rows: StatementRow[] = [];
  const unreadable: UnreadableRow[] = [];
  for (const block of blocks(source, "STMTTRN")) {
    const raw = source.slice(block.start, block.end).trim();
    const line = lineNumber(source, block.start);
    const posted = tagValue(block.text, "DTPOSTED");
    const date = isoDate(posted);
    if (!date) {
      unreadable.push({ line, raw, reason: "date_unreadable" });
      continue;
    }
    const amount = amountProblem(tagValue(block.text, "TRNAMT"), minorDigits);
    if ("reason" in amount) {
      unreadable.push({ line, raw, reason: amount.reason });
      continue;
    }
    rows.push({
      date,
      description: description(block.text),
      amount: amount.minor,
      bankId: tagValue(block.text, "FITID"),
    });
  }

  let closingBalance: number | null = null;
  let closingDate: string | null = null;
  const ledger = blocks(source, "LEDGERBAL")[0];
  if (ledger) {
    const line = lineNumber(source, ledger.start);
    const raw = source.slice(ledger.start, ledger.end).trim();
    const balanceText = tagValue(ledger.text, "BALAMT");
    const balance = amountProblem(balanceText, minorDigits);
    const posted = tagValue(ledger.text, "DTASOF");
    const date = isoDate(posted);
    if ("reason" in balance && balanceText !== null) {
      unreadable.push({ line, raw, reason: balance.reason });
    } else if ("minor" in balance) {
      closingBalance = balance.minor;
    }
    if (posted !== null && !date) {
      unreadable.push({ line, raw, reason: "date_unreadable" });
    } else {
      closingDate = date;
    }
  }

  return { rows, unreadable, closingBalance, closingDate };
}
