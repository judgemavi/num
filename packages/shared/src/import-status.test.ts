import { expect, test } from "bun:test";
import { importBatchStatus } from "./import-batch";

const batchId = "11111111-1111-4111-8111-111111111111";

test("import status is undone, needs you, or imported", () => {
  const open = {
    undoneAt: null,
    needsReview: 0,
    batchId,
    unreadableLines: [] as number[],
    dismissedKeys: new Set<string>(),
  };

  expect(importBatchStatus(open)).toBe("imported");
  expect(importBatchStatus({ ...open, needsReview: 1 })).toBe("needs_you");
  expect(importBatchStatus({ ...open, unreadableLines: [4] })).toBe("needs_you");
  expect(
    importBatchStatus({
      ...open,
      unreadableLines: [4],
      dismissedKeys: new Set([`import_unreadable:${batchId}:4`]),
    }),
  ).toBe("imported");
  expect(importBatchStatus({ ...open, undoneAt: "2026-04-01T00:00:00Z", needsReview: 2, unreadableLines: [4] })).toBe(
    "undone",
  );
});
