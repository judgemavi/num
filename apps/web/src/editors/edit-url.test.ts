import { describe, expect, test } from "bun:test";
import { formatEditParam, parseEditParam } from "./edit-url";

describe("edit url", () => {
  test("parses a record id and a new record", () => {
    expect(parseEditParam("transaction:6b1e0c4a-1111-4222-8333-444455556666")).toEqual({
      kind: "transaction",
      id: "6b1e0c4a-1111-4222-8333-444455556666",
    });
    expect(parseEditParam("account:new")).toEqual({ kind: "account", id: null });
    expect(formatEditParam("commitment", null)).toBe("commitment:new");
    expect(formatEditParam("tag", "tag-1")).toBe("tag:tag-1");
  });

  test("rejects a missing kind, an unknown kind, and an empty id", () => {
    expect(parseEditParam(null)).toBe(null);
    expect(parseEditParam("")).toBe(null);
    expect(parseEditParam("transaction")).toBe(null);
    expect(parseEditParam("paycheck:abc")).toBe(null);
    expect(parseEditParam("transaction:")).toBe(null);
    expect(parseEditParam("transaction:one:two")).toBe(null);
  });
});
