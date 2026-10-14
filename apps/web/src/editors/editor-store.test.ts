import { describe, expect, test } from "bun:test";
import { createEditorStore } from "./editor-store";

const noUrl = { editValue: null, pushed: false };

describe("editor store", () => {
  test("gives the result to the code that opened the editor", async () => {
    const store = createEditorStore();
    const done = store.open({ kind: "tag", input: { id: null } }, noUrl);
    const key = store.snapshot().editor?.key ?? 0;

    expect(store.close(key, "tag-1")?.frame.kind).toBe("tag");
    expect(await done).toBe("tag-1");
    expect(store.snapshot().editor).toBe(null);
  });

  test("closes the open editor with no result when a second editor opens", async () => {
    const store = createEditorStore();
    const first = store.open({ kind: "account", input: { id: null } }, noUrl);
    const firstKey = store.snapshot().editor?.key ?? 0;
    store.open({ kind: "category", input: { id: null } }, noUrl);

    expect(await first).toBe(null);
    expect(store.snapshot().editor?.frame.kind).toBe("category");
    expect(store.close(firstKey, "late")).toBe(null);
    expect(store.snapshot().editor?.frame.kind).toBe("category");
  });

  test("answers an open confirmation with no when a second confirmation opens", async () => {
    const store = createEditorStore();
    const first = store.ask({ title: "First" });
    const second = store.ask({ title: "Second" });
    store.answer(true);

    expect(await first).toBe(false);
    expect(await second).toBe(true);
    expect(store.snapshot().confirm).toBe(null);
  });
});
