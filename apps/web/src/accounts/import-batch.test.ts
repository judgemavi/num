import { describe, expect, test } from "bun:test";
import { ApiError } from "../api/client";
import type { ColumnMap } from "@num/shared";
import type { ImportFileRow } from "./import-file-list";
import { emptyImportBatch, importBatchReducer, runImportBatch } from "./import-batch";

type ImportAnswer = Awaited<ReturnType<Parameters<typeof runImportBatch>[1]["post"]>>;

const columnMap: ColumnMap = { date: 0, description: 1, amount: 2, hasHeader: false, dateOrder: "mdy", signConvention: "account", decimalSeparator: "." };
const counts = { created: 1, matched: 0, duplicate: 0, needsReview: 0, unreadable: 0 };

function row(key: string, text: string, patch: Partial<ImportFileRow> = {}): ImportFileRow {
  return {
    key,
    file: new File([text], `${key}.csv`),
    text,
    format: { kind: "unknown" },
    formatTouched: false,
    accountId: "account-1",
    accountTouched: false,
    columnMap,
    firstDate: text.length > 0 ? `2026-${text.slice(0, 2)}-${text.slice(3, 5)}` : null,
    phase: "ready",
    message: null,
    counts: null,
    batchId: null,
    alreadyImported: false,
    unreadable: [],
    createdAt: null,
    openingSuggestion: null,
    ...patch,
  };
}

function imported(id: string): ImportAnswer {
  return { accountId: "account-1", documentId: null, filename: "synthetic.csv", parser: "csv", periodStart: "2026-03-01", periodEnd: "2026-03-01", closingBalance: null, closingDate: null, undoneAt: null, kind: "batch", id, createdAt: "2026-03-01T00:00:00.000Z", counts, alreadyImported: false, unreadable: [], openingSuggestion: null };
}

/** The parts of the editor that the batch uses. `answers` are the answers of the API, in order. */
function editor(answers: (ImportAnswer | Error)[], maps: ColumnMap[] = []) {
  const posted: { name: string; columnMap: ColumnMap | null }[] = [];
  const asked: string[] = [];
  const changes: (Partial<ImportFileRow> & { key: string })[] = [];
  const log = { posted, asked, changes };
  const io: Parameters<typeof runImportBatch>[1] = {
    presets: [],
    asOf: "2026-03-10",
    post: async (input) => {
      log.posted.push({ name: input.file.name, columnMap: input.columnMap });
      const answer = answers.shift();
      if (answer instanceof Error) {
        throw answer;
      }
      if (!answer) {
        throw new Error("No import answer remains");
      }
      return answer;
    },
    askForMap: async (asked) => {
      log.asked.push(asked.key);
      return maps.shift() ?? null;
    },
    onRow: (key, patch) => log.changes.push({ key, ...patch }),
  };
  return { io, log };
}

describe("import batch reducer", () => {
  test("adds the files that the editor read, and changes one row", () => {
    const reading = importBatchReducer(emptyImportBatch, { type: "readingStarted" });
    expect(reading.phase).toBe("reading");
    const read = importBatchReducer(reading, { type: "filesRead", rows: [row("a", "03/01/2026,Tea,-4.00"), row("b", "03/02/2026,Bus,-3.00")] });
    expect(read.phase).toBe("idle");
    const changed = importBatchReducer(read, { type: "rowChanged", key: "b", patch: { accountId: "account-2", accountTouched: true } });
    expect(changed.rows.map((item) => item.accountId)).toEqual(["account-1", "account-2"]);
  });

  test("a batch runs, and then it stops or it is finished", () => {
    const started = importBatchReducer(emptyImportBatch, { type: "batchStarted", rows: [row("a", "03/01/2026,Tea,-4.00")] });
    expect(started.phase).toBe("running");
    expect(started.rows).toHaveLength(1);
    expect(importBatchReducer(started, { type: "batchStopped" }).phase).toBe("idle");
    expect(importBatchReducer(started, { type: "batchFinished" }).phase).toBe("finished");
  });
});

describe("import batch", () => {
  test("imports the files in the order of their first dates and keeps the result of each file", async () => {
    const { io, log } = editor([imported("batch-1"), imported("batch-2")]);
    const result = await runImportBatch([row("late", "03/09/2026,Tea,-4.00"), row("early", "03/02/2026,Bus,-3.00")], io);

    expect(log.posted.map((item) => item.name)).toEqual(["early.csv", "late.csv"]);
    expect(result.stopped).toBe(false);
    expect(result.rows.map((item) => [item.key, item.phase, item.batchId])).toEqual([
      ["late", "done", "batch-2"],
      ["early", "done", "batch-1"],
    ]);
    expect(log.changes.filter((change) => change.phase === "importing").map((change) => change.key)).toEqual(["early", "late"]);
  });

  test("asks for the column map of each file that needs one before it sends a file", async () => {
    const { io, log } = editor([imported("batch-1"), imported("batch-2")], [columnMap]);
    const result = await runImportBatch([row("mapped", "03/01/2026,Tea,-4.00"), row("columns", "03/05/2026,Bus,-3.00", { columnMap: null, firstDate: null })], io);

    expect(log.asked).toEqual(["columns"]);
    expect(log.posted).toEqual([
      { name: "mapped.csv", columnMap },
      { name: "columns.csv", columnMap },
    ]);
    expect(result.rows.find((item) => item.key === "columns")?.firstDate).toBe("2026-03-05");
  });

  test("stops and sends no file when the person gives no column map", async () => {
    const { io, log } = editor([imported("batch-1")]);
    const result = await runImportBatch([row("mapped", "03/01/2026,Tea,-4.00"), row("columns", "03/05/2026,Bus,-3.00", { columnMap: null })], io);

    expect(result.stopped).toBe(true);
    expect(log.posted).toEqual([]);
    expect(result.rows.every((item) => item.phase === "ready")).toBe(true);
  });

  test("when the API cannot read the columns, the person gives the map and the file is sent one more time", async () => {
    const { io, log } = editor([{ kind: "preview", rows: [["03/01/2026", "Tea", "-4.00"]] }, imported("batch-1")], [columnMap]);
    const result = await runImportBatch([row("a", "03/01/2026,Tea,-4.00", { format: { kind: "ofx" }, columnMap: null })], io);

    expect(log.asked).toEqual(["a"]);
    expect(log.posted).toHaveLength(2);
    expect(log.posted[1]?.columnMap).toEqual(columnMap);
    expect(result.rows[0]?.phase).toBe("done");
  });

  test("a second preview for one file is an error, and the batch goes to the next file", async () => {
    const preview = { kind: "preview", rows: [] } satisfies ImportAnswer;
    const { io } = editor([preview, preview, imported("batch-2")], [columnMap]);
    const result = await runImportBatch([row("a", "03/01/2026,Tea,-4.00", { format: { kind: "ofx" }, columnMap: null }), row("b", "03/02/2026,Bus,-3.00")], io);

    expect(result.stopped).toBe(false);
    expect(result.rows.map((item) => item.phase)).toEqual(["error", "done"]);
  });

  test("the batch stops when the person gives no map after a preview, and the file is ready again", async () => {
    const { io, log } = editor([{ kind: "preview", rows: [] }, imported("batch-2")]);
    const result = await runImportBatch([row("a", "03/01/2026,Tea,-4.00", { format: { kind: "ofx" }, columnMap: null }), row("b", "03/02/2026,Bus,-3.00")], io);

    expect(result.stopped).toBe(true);
    expect(log.posted).toHaveLength(1);
    expect(result.rows.map((item) => item.phase)).toEqual(["ready", "ready"]);
  });

  test("a file with an error or with no account gets a message, and the other files are imported", async () => {
    const { io, log } = editor([new ApiError({ code: "document_too_large", params: {} }), imported("batch-3")]);
    const result = await runImportBatch(
      [row("a", "03/01/2026,Tea,-4.00"), row("none", "03/02/2026,Bus,-3.00", { accountId: "" }), row("c", "03/03/2026,Jam,-2.00")],
      io,
    );

    expect(log.posted.map((item) => item.name)).toEqual(["a.csv", "c.csv"]);
    expect(result.rows.map((item) => item.phase)).toEqual(["error", "error", "done"]);
    expect(result.rows.every((item) => item.phase !== "error" || (item.message ?? "").length > 0)).toBe(true);
  });

  test("a file with only unreadable rows is done with no import", async () => {
    const unreadable = [{ line: 1, raw: "x", reason: "date_unreadable" }] satisfies ImportFileRow["unreadable"];
    const { io } = editor([{ kind: "unreadable", unreadable }]);
    const result = await runImportBatch([row("a", "03/01/2026,Tea,-4.00")], io);

    expect(result.rows[0]).toMatchObject({ phase: "done", batchId: null, counts: { created: 0, unreadable: 1 } });
  });
});
