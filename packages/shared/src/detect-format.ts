import { readAmount } from "./read-amount";
import { milliunitDigits } from "./currency";
import { isIsoDate } from "./date";
import { columnMapSchema, statementDate, statementDatePattern, stripBom, type ColumnMap, type DateFormat, type DateOrder, type DecimalSeparator, type Preset } from "./statement";

export type StatementFormat =
  | { kind: "ofx" }
  | { kind: "preset"; presetId: string }
  | { kind: "ambiguous"; candidates: string[] }
  | { kind: "unknown" };

export const ofxPresetId = "ofx";

export function chosenPresetId(format: StatementFormat): string | null {
  if (format.kind === "ofx") {
    return ofxPresetId;
  }
  if (format.kind === "preset") {
    return format.presetId;
  }
  if (format.kind === "ambiguous") {
    return format.candidates[0] ?? null;
  }
  return null;
}

export type ImportAccountChoice = {
  id: string;
  archivedAt: string | null;
  importPreset: string | null;
  columnMap: ColumnMap | null;
};

const sampleLines = 12;
const dateScanLines = 80;
const scoredRows = 8;

export function isOfxFile(filename: string, text: string): boolean {
  if (/\.(ofx|qfx)$/i.test(filename)) {
    return true;
  }
  return /OFXHEADER|<OFX>/i.test(text.slice(0, 500));
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

export function sampleCsvRows(text: string, limit = 6): string[][] {
  return contentLines(text, limit)
    .map((line) => splitCsvLine(line));
}

export function detectStatementFormat(filename: string, text: string, presets: readonly Preset[]): StatementFormat {
  if (isOfxFile(filename, text)) {
    return { kind: "ofx" };
  }
  return detectPreset(text, presets);
}

export function firstStatementDate(
  text: string,
  format: StatementFormat,
  presets: readonly Preset[],
  columnMap?: ColumnMap | null,
): string | null {
  if (format.kind === "ofx") {
    return firstOfxDate(text);
  }
  const presetId = chosenPresetId(format);
  const map = presetId ? presets.find((preset) => preset.id === presetId) : columnMap;
  if (!map) {
    return null;
  }
  const rows = sampleCsvRows(text, dateScanLines);
  const start = firstDataIndex(rows, map);
  if (start < 0) {
    return null;
  }
  for (let index = start; index < rows.length; index += 1) {
    const date = statementDate(rows[index]?.[map.date] ?? "", map.dateOrder);
    if (date) {
      return date;
    }
  }
  return null;
}

export function orderByFirstDate<T extends { firstDate: string | null }>(items: readonly T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      if (left.item.firstDate === right.item.firstDate) {
        return left.index - right.index;
      }
      if (left.item.firstDate === null) {
        return 1;
      }
      if (right.item.firstDate === null) {
        return -1;
      }
      return left.item.firstDate < right.item.firstDate ? -1 : 1;
    })
    .map((entry) => entry.item);
}

export function guessImportAccount(
  accounts: readonly ImportAccountChoice[],
  format: StatementFormat,
  presets: readonly Preset[],
): string | null {
  const presetId = chosenPresetId(format);
  if (!presetId) {
    return null;
  }
  const preset = presets.find((item) => item.id === presetId);
  const signature = preset ? mapSignature(columnMapFromPreset(preset)) : null;
  const matches = accounts.filter((account) => {
    if (account.archivedAt !== null) {
      return false;
    }
    if (account.importPreset === presetId) {
      return true;
    }
    return signature !== null && account.columnMap !== null && mapSignature(account.columnMap) === signature;
  });
  return matches.length === 1 ? (matches[0]?.id ?? null) : null;
}

function detectPreset(text: string, presets: readonly Preset[]): StatementFormat {
  const rows = sampleCsvRows(text, sampleLines);
  const fits = presets.filter((preset) => presetFit(rows, preset)).map((preset) => preset.id);
  const first = fits[0];
  if (!first) {
    return { kind: "unknown" };
  }
  if (fits.length === 1) {
    return { kind: "preset", presetId: first };
  }
  return { kind: "ambiguous", candidates: fits };
}

function presetFit(rows: string[][], preset: Preset) {
  const start = dataStart(rows, preset);
  if (start < 0) {
    return false;
  }
  const data = rows.slice(start, start + scoredRows);
  if (data.length === 0) {
    return false;
  }
  const width = columnWidth(preset);
  return data.every((row) => row.length === width && rowFits(row, preset));
}

function firstDataIndex(
  rows: string[][],
  map: { hasHeader: ColumnMap["hasHeader"]; date: number; dateOrder: DateOrder },
): number {
  if (rows.length === 0) {
    return -1;
  }
  const firstIsDate = statementDate(rows[0]?.[map.date] ?? "", map.dateOrder) !== null;
  if (map.hasHeader === true) {
    return firstIsDate || rows.length < 2 ? -1 : 1;
  }
  if (map.hasHeader === false) {
    return firstIsDate ? 0 : -1;
  }
  if (firstIsDate) {
    return 0;
  }
  return rows.length > 1 ? 1 : -1;
}

function dataStart(rows: string[][], preset: Preset): number {
  if (rows.length === 0) {
    return -1;
  }
  const firstIsDate = dateMatchesFormat(rows[0]?.[preset.date] ?? "", preset.dateFormat);
  if (preset.hasHeader === true) {
    if (firstIsDate) {
      return -1;
    }
    return rows.length > 1 ? 1 : -1;
  }
  if (preset.hasHeader === false) {
    return firstIsDate ? 0 : -1;
  }
  if (firstIsDate) {
    return 0;
  }
  return rows.length > 1 ? 1 : -1;
}

function rowFits(row: string[], preset: Preset) {
  if (!dateMatchesFormat(row[preset.date] ?? "", preset.dateFormat)) {
    return false;
  }
  if (preset.card != null && !looksLikeMaskedCard(row[preset.card] ?? "")) {
    return false;
  }
  return amountsFit(row, preset);
}

function dateMatchesFormat(raw: string, format: DateFormat) {
  const text = raw.trim();
  if (format === "iso") {
    return isIsoDate(text);
  }
  if (isIsoDate(text) || !statementDatePattern.test(text)) {
    return false;
  }
  return statementDate(text, format) !== null;
}

function looksLikeMaskedCard(raw: string) {
  const text = raw.trim();
  return /[*xX]/.test(text) && /\d{4}/.test(text);
}

function amountsFit(row: string[], preset: Preset) {
  const decimal = preset.decimalSeparator ?? ".";
  const columns = [preset.amount, preset.debit, preset.credit, preset.balance].filter(
    (index): index is number => index != null,
  );
  if (columns.some((index) => !looksLikeAmount(row[index] ?? "", decimal))) {
    return false;
  }
  const pay = [preset.amount, preset.debit, preset.credit].filter((index): index is number => index != null);
  return pay.some((index) => (row[index] ?? "").trim().length > 0);
}

function looksLikeAmount(raw: string, decimal: DecimalSeparator) {
  const text = raw.replace(/[^\d.,]/g, "");
  if (text.length > 0) {
    const pattern = decimal === ","
      ? /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$/
      : /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/;
    if (!pattern.test(text)) return false;
  }
  return readAmount(raw, milliunitDigits, decimal).kind !== "error";
}

function columnWidth(preset: Preset) {
  const indexes = [preset.date, preset.description, preset.amount, preset.debit, preset.credit, preset.balance, preset.bankId, preset.card];
  let width = 1;
  for (const index of indexes) {
    if (index != null && index + 1 > width) {
      width = index + 1;
    }
  }
  return width;
}

function contentLines(text: string, limit: number) {
  const lines: string[] = [];
  const source = stripBom(text);
  let start = 0;
  while (start < source.length && lines.length < limit) {
    const newline = source.indexOf("\n", start);
    const end = newline < 0 ? source.length : newline;
    const line = source.slice(start, end).replace(/\r$/, "");
    if (line.trim().length > 0) {
      lines.push(line);
    }
    start = end + 1;
  }
  return lines;
}

function firstOfxDate(text: string) {
  const head = contentLines(text, dateScanLines).join("\n");
  const match = /<DTPOSTED>\s*(\d{4})(\d{2})(\d{2})/i.exec(head);
  if (!match?.[1] || !match[2] || !match[3]) {
    return null;
  }
  const iso = `${match[1]}-${match[2]}-${match[3]}`;
  return isIsoDate(iso) ? iso : null;
}

function columnMapFromPreset(preset: Preset) {
  return columnMapSchema.parse({
    hasHeader: preset.hasHeader,
    date: preset.date,
    description: preset.description,
    amount: preset.amount,
    debit: preset.debit,
    credit: preset.credit,
    balance: preset.balance,
    bankId: preset.bankId,
    dateOrder: preset.dateOrder,
    signConvention: preset.signConvention,
    balanceSign: preset.balanceSign,
    decimalSeparator: preset.decimalSeparator,
  });
}

function mapSignature(map: ColumnMap) {
  return [
    String(map.hasHeader),
    map.date,
    map.description,
    map.amount ?? "",
    map.debit ?? "",
    map.credit ?? "",
    map.balance ?? "",
    map.bankId ?? "",
    map.dateOrder,
    map.signConvention,
    map.balanceSign ?? "",
    map.decimalSeparator ?? "",
  ].join("|");
}
