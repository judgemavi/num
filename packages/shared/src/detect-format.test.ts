import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { detectStatementFormat, firstStatementDate, guessImportAccount, orderByFirstDate, type ImportAccountChoice } from "./detect-format";
import { columnMapSchema, presetSchema, type ColumnMap, type Preset } from "./statement";

const presetDir = join(import.meta.dir, "../../../presets");

function loadPresets(): Preset[] {
  return readdirSync(presetDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => presetSchema.parse(JSON.parse(readFileSync(join(presetDir, name), "utf8"))))
    .sort((left, right) => (left.id < right.id ? -1 : 1));
}

function fixture(name: string): string {
  return readFileSync(join(presetDir, "fixtures", name), "utf8");
}

function mapOf(preset: Preset): ColumnMap {
  const { id: _id, name: _name, ...fields } = preset;
  return columnMapSchema.parse(fields);
}

function account(
  id: string,
  importPreset: string | null,
  columnMap: ColumnMap | null,
  archivedAt: string | null = null,
): ImportAccountChoice {
  return { id, archivedAt, importPreset, columnMap };
}

test("each preset fixture detects that preset", () => {
  const presets = loadPresets();
  const files = [
    ["td-chequing.csv", "td-chequing"],
    ["td-savings.csv", "td-savings"],
    ["td-credit-card.csv", "td-credit-card"],
    ["cibc-credit-card.csv", "cibc-credit-card"],
  ] as const;

  for (const [file, id] of files) {
    expect(detectStatementFormat(file, fixture(file), presets)).toEqual({ kind: "preset", presetId: id });
  }
});

test("OFX content and an OFX or QFX name detect as OFX", () => {
  const presets = loadPresets();
  const text = fixture("sample.ofx");
  expect(detectStatementFormat("sample.ofx", text, presets)).toEqual({ kind: "ofx" });
  expect(detectStatementFormat("export.qfx", "not a statement", presets)).toEqual({ kind: "ofx" });
  expect(detectStatementFormat("notes.txt", text, presets)).toEqual({ kind: "ofx" });
});

test("a CSV that fits no preset is unknown", () => {
  const text = "name,city\nNorth Market,Halifax\n";
  expect(detectStatementFormat("accounts.csv", text, loadPresets())).toEqual({ kind: "unknown" });
});

test("the same layout without a file name stays unknown", () => {
  expect(detectStatementFormat("statement.csv", fixture("td-chequing.csv"), loadPresets())).toEqual({ kind: "unknown" });
});

test("a header row selects the preset that expects a header", () => {
  const base = {
    name: "Example",
    date: 0,
    description: 1,
    amount: 2,
    dateOrder: "mdy" as const,
    signConvention: "account" as const,
  };
  const presets = [
    presetSchema.parse({ ...base, id: "with-header", hasHeader: true }),
    presetSchema.parse({ ...base, id: "no-header", hasHeader: false }),
  ];
  const withHeader = "Date,Description,Amount\n02/01/2026,NORTH MARKET,12.50\n";
  const noHeader = "02/01/2026,NORTH MARKET,12.50\n";
  expect(detectStatementFormat("export.csv", withHeader, presets)).toEqual({ kind: "preset", presetId: "with-header" });
  expect(detectStatementFormat("export.csv", noHeader, presets)).toEqual({ kind: "preset", presetId: "no-header" });
});

test("account guess selects one match by preset or column map", () => {
  const presets = loadPresets();
  const format = { kind: "preset" as const, presetId: "cibc-credit-card" };
  const cibc = mapOf(presets.find((preset) => preset.id === "cibc-credit-card")!);

  expect(
    guessImportAccount(
      [account("a", "cibc-credit-card", null), account("b", "td-chequing", null)],
      format,
      presets,
    ),
  ).toBe("a");
  expect(guessImportAccount([account("a", null, cibc), account("b", "td-chequing", null)], format, presets)).toBe("a");
  expect(guessImportAccount([account("a", "cibc-credit-card", cibc)], format, presets)).toBe("a");
});

test("account guess is empty when no active account matches", () => {
  const presets = loadPresets();
  const format = { kind: "preset" as const, presetId: "cibc-credit-card" };
  expect(guessImportAccount([account("a", "td-chequing", null)], format, presets)).toBeNull();
  expect(guessImportAccount([account("a", "cibc-credit-card", null, "2026-01-01T00:00:00Z")], format, presets)).toBeNull();
  expect(guessImportAccount([], { kind: "ofx" }, presets)).toBeNull();
  expect(guessImportAccount([account("a", "cibc-credit-card", null)], { kind: "unknown" }, presets)).toBeNull();
});

test("account guess is empty when several accounts match", () => {
  const presets = loadPresets();
  const format = { kind: "preset" as const, presetId: "cibc-credit-card" };
  const cibc = mapOf(presets.find((preset) => preset.id === "cibc-credit-card")!);
  expect(
    guessImportAccount(
      [account("a", "cibc-credit-card", null), account("b", "cibc-credit-card", null)],
      format,
      presets,
    ),
  ).toBeNull();
  expect(guessImportAccount([account("a", "cibc-credit-card", null), account("b", null, cibc)], format, presets)).toBeNull();
});

test("import order follows each file's first date, oldest first", () => {
  const presets = loadPresets();
  const chequing = firstStatementDate(fixture("td-chequing.csv"), { kind: "preset", presetId: "td-chequing" }, presets);
  const card = firstStatementDate(fixture("td-credit-card.csv"), { kind: "preset", presetId: "td-credit-card" }, presets);
  const savings = firstStatementDate(fixture("td-savings.csv"), { kind: "preset", presetId: "td-savings" }, presets);
  const ofx = firstStatementDate(fixture("sample.ofx"), { kind: "ofx" }, presets);
  expect(chequing).toBe("2026-01-02");
  expect(card).toBe("2026-01-05");
  expect(ofx).toBe("2026-02-11");
  expect(savings).toBe("2026-03-15");

  const ordered = orderByFirstDate([
    { id: "savings", firstDate: savings },
    { id: "none", firstDate: null },
    { id: "card", firstDate: card },
    { id: "chequing", firstDate: chequing },
    { id: "same", firstDate: chequing },
  ]);
  expect(ordered.map((item) => item.id)).toEqual(["chequing", "same", "card", "savings", "none"]);
});
