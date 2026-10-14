import { expect, test } from "bun:test";
import { foldName } from "./index";

test("a folded name has no accents and no capitals", () => {
  expect(foldName("École")).toBe("ecole");
  expect(foldName("Crème Brûlée")).toBe("creme brulee");
  expect(foldName("ÅNGSTRÖM")).toBe("angstrom");
  expect(foldName("ＡＢＣ")).toBe("abc");
  expect(foldName("Eagle")).toBe("eagle");
});

test("a name with an accent sorts between the plain names", () => {
  const names = ["Fable", "École", "Eagle"];
  expect(names.sort((left, right) => (foldName(left) < foldName(right) ? -1 : 1))).toEqual(["Eagle", "École", "Fable"]);
});
