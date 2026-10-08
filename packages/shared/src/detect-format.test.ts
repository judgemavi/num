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

const fixtures = [
  ["td-chequing.csv", "td-bank-account"],
  ["td-savings.csv", "td-bank-account"],
  ["td-credit-card.csv", "td-credit-card"],
  ["cibc-credit-card.csv", "cibc-credit-card"],
] as const;

test("each fixture matches only its own preset", () => {
  const presets = loadPresets();
  for (const [file, id] of fixtures) {
    const text = fixture(file);
    expect(detectStatementFormat("accountactivity.csv", text, presets)).toEqual({ kind: "preset", presetId: id });
    for (const preset of presets) {
      const alone = detectStatementFormat("accountactivity.csv", text, [preset]);
      if (preset.id === id) {
        expect(alone).toEqual({ kind: "preset", presetId: id });
      } else {
        expect(alone).toEqual({ kind: "unknown" });
      }
    }
  }
});

test("the file name does not choose a preset", () => {
  const presets = loadPresets();
  const text = fixture("td-chequing.csv");
  expect(detectStatementFormat("td-credit-card.csv", text, presets)).toEqual({
    kind: "preset",
    presetId: "td-bank-account",
  });
});

test("two presets that both fit stay a choice", () => {
  const card = loadPresets().find((preset) => preset.id === "td-credit-card");
  if (!card) {
    throw new Error("Missing preset");
  }
  const copy = { ...card, id: "td-credit-card-b", name: "Other card" };
  expect(detectStatementFormat("accountactivity.csv", fixture("td-credit-card.csv"), [card, copy])).toEqual({
    kind: "ambiguous",
    candidates: ["td-credit-card", "td-credit-card-b"],
  });
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

test("a header row selects the preset that expects a header", () => {
  const base = {
    name: "Example",
    dateFormat: "mdy" as const,
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
      [account("a", "cibc-credit-card", null), account("b", "td-bank-account", null)],
      format,
      presets,
    ),
  ).toBe("a");
  expect(guessImportAccount([account("a", null, cibc), account("b", "td-bank-account", null)], format, presets)).toBe("a");
  expect(guessImportAccount([account("a", "cibc-credit-card", cibc)], format, presets)).toBe("a");
});

test("account guess is empty when no active account matches", () => {
  const presets = loadPresets();
  const format = { kind: "preset" as const, presetId: "cibc-credit-card" };
  expect(guessImportAccount([account("a", "td-bank-account", null)], format, presets)).toBeNull();
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
  const chequing = firstStatementDate(fixture("td-chequing.csv"), { kind: "preset", presetId: "td-bank-account" }, presets);
  const card = firstStatementDate(fixture("td-credit-card.csv"), { kind: "preset", presetId: "td-credit-card" }, presets);
  const savings = firstStatementDate(fixture("td-savings.csv"), { kind: "preset", presetId: "td-bank-account" }, presets);
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
