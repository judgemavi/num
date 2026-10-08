import { isIsoDate } from "./date";
import { columnMapSchema, statementDate, type ColumnMap, type DateOrder, type DecimalSeparator, type Preset } from "./statement";

export type StatementFormat = { kind: "ofx" } | { kind: "preset"; presetId: string } | { kind: "unknown" };

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
  return contentLines(text)
    .slice(0, limit)
    .map((line) => splitCsvLine(line));
}

export function detectStatementFormat(filename: string, text: string, presets: readonly Preset[]): StatementFormat {
  if (isOfxFile(filename, text)) {
    return { kind: "ofx" };
  }
  const presetId = bestPreset(filename, text, presets);
  if (presetId) {
    return { kind: "preset", presetId };
  }
  return { kind: "unknown" };
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
  const map = format.kind === "preset" ? presets.find((preset) => preset.id === format.presetId) : columnMap;
  if (!map) {
    return null;
  }
  const rows = sampleCsvRows(text, dateScanLines);
  const start = dataStart(rows, map);
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
  if (format.kind !== "preset") {
    return null;
  }
  const preset = presets.find((item) => item.id === format.presetId);
  const signature = preset ? mapSignature(columnMapFromPreset(preset)) : null;
  const matches = accounts.filter((account) => {
    if (account.archivedAt !== null) {
      return false;
    }
    if (account.importPreset === format.presetId) {
      return true;
    }
    return signature !== null && account.columnMap !== null && mapSignature(account.columnMap) === signature;
  });
  return matches.length === 1 ? (matches[0]?.id ?? null) : null;
}

function bestPreset(filename: string, text: string, presets: readonly Preset[]): string | null {
  const rows = sampleCsvRows(text, sampleLines);
  const fits = presets.flatMap((preset) => {
    const fit = presetFit(rows, preset);
    return fit ? [{ id: preset.id, exact: fit.exact }] : [];
  });
  if (fits.length === 0) {
    return null;
  }
  const named = fits.filter((fit) => filenameHasPreset(filename, fit.id));
  if (named.length === 1) {
    return named[0]?.id ?? null;
  }
  const exact = fits.filter((fit) => fit.exact);
  const pool = exact.length > 0 ? exact : fits;
  return pool.length === 1 ? (pool[0]?.id ?? null) : null;
}

function presetFit(rows: string[][], preset: Preset): { exact: boolean } | null {
  const start = dataStart(rows, preset);
  if (start < 0) {
    return null;
  }
  const data = rows.slice(start, start + scoredRows);
  if (data.length === 0) {
    return null;
  }
  const width = columnWidth(preset);
  if (!data.every((row) => row.length >= width && rowFits(row, preset))) {
    return null;
  }
  return { exact: data.every((row) => row.length === width) };
}

function dataStart(
  rows: string[][],
  map: { hasHeader: ColumnMap["hasHeader"]; date: number; dateOrder: DateOrder },
): number {
  if (rows.length === 0) {
    return -1;
  }
  const firstDate = statementDate(rows[0]?.[map.date] ?? "", map.dateOrder);
  if (map.hasHeader === true) {
    if (firstDate !== null) {
      return -1;
    }
    return rows.length > 1 ? 1 : -1;
  }
  if (map.hasHeader === false) {
    return firstDate !== null ? 0 : -1;
  }
  if (firstDate !== null) {
    return 0;
  }
  return rows.length > 1 ? 1 : -1;
}

function rowFits(row: string[], preset: Preset): boolean {
  if (statementDate(row[preset.date] ?? "", preset.dateOrder) === null) {
    return false;
  }
  return amountsFit(row, preset);
}

function amountsFit(row: string[], preset: Preset): boolean {
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

function looksLikeAmount(raw: string, decimal: DecimalSeparator): boolean {
  let text = raw.trim().replace(/\s/g, "");
  if (text.length === 0) {
    return true;
  }
  if (text.startsWith("(") && text.endsWith(")") && text.length > 2) {
    text = text.slice(1, -1);
  }
  if (text.startsWith("+") || text.startsWith("-")) {
    text = text.slice(1);
  }
  text = text.replace(/[$€£¥]/g, "");
  if (decimal === ",") {
    return /^\d{1,3}(\.\d{3})*(,\d+)?$/.test(text) || /^\d+(,\d+)?$/.test(text);
  }
  return /^\d{1,3}(,\d{3})*(\.\d+)?$/.test(text) || /^\d+(\.\d+)?$/.test(text);
}

function columnWidth(preset: Preset): number {
  const indexes = [preset.date, preset.description, preset.amount, preset.debit, preset.credit, preset.balance, preset.bankId];
  let width = 1;
  for (const index of indexes) {
    if (index != null && index + 1 > width) {
      width = index + 1;
    }
  }
  return width;
}

function filenameHasPreset(filename: string, presetId: string): boolean {
  const key = filename.toLowerCase().replace(/[\s_]+/g, "-");
  const id = presetId.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${id}(?:[^a-z0-9]|$)`).test(key);
}

function contentLines(text: string): string[] {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return source.split(/\r?\n/).filter((line) => line.trim().length > 0);
}

function firstOfxDate(text: string): string | null {
  const head = contentLines(text).slice(0, dateScanLines).join("\n");
  const match = /<DTPOSTED>\s*(\d{4})(\d{2})(\d{2})/i.exec(head);
  if (!match?.[1] || !match[2] || !match[3]) {
    return null;
  }
  const iso = `${match[1]}-${match[2]}-${match[3]}`;
  return isIsoDate(iso) ? iso : null;
}

function columnMapFromPreset(preset: Preset): ColumnMap {
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

function mapSignature(map: ColumnMap): string {
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
