import { expect, test } from "bun:test";
import { identityColors, nextIdentityColor } from "./identity";

test("identity colours rotate in palette order and repeat after twelve records", () => {
  expect(Array.from({ length: 24 }, (_, count) => nextIdentityColor(count))).toEqual([...identityColors, ...identityColors]);
  expect(nextIdentityColor(-1)).toBe("slate");
});
