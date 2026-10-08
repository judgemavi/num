import { describe, expect, test } from "bun:test";
import { createEditorStack } from "./editor-stack";

describe("editor stack", () => {
  test("returns the created id to the editor that opened the child", async () => {
    const stack = createEditorStack();
    const account = stack.open("account", { id: null });
    const category = stack.open("category", { id: null });

    expect(stack.frames.map((frame) => frame.kind)).toEqual(["account", "category"]);

    stack.complete(category.key, "category-1");
    expect(await category.done).toBe("category-1");
    expect(stack.frames.map((frame) => frame.kind)).toEqual(["account"]);

    stack.complete(account.key, null);
    expect(await account.done).toBe(null);
    expect(stack.frames).toEqual([]);
  });
});
