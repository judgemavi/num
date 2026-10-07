import { join } from "node:path";
import { expect, test } from "bun:test";
import { pathInsideRoot } from "./web-files";

const root = join("/srv", "num", "web");

test("a web path stays inside the web directory", () => {
  expect(pathInsideRoot(root, "/index.html")).toBe(join(root, "index.html"));
  expect(pathInsideRoot(root, "/assets/app.js")).toBe(join(root, "assets", "app.js"));
});

test("a web path cannot leave the web directory", () => {
  expect(pathInsideRoot(root, "/../secret")).toBeNull();
  expect(pathInsideRoot(root, "/%2e%2e/secret")).toBeNull();
  expect(pathInsideRoot(root, "/%2e%2e%2fsecret")).toBeNull();
  expect(pathInsideRoot(root, "/safe/%00/file")).toBeNull();
  expect(pathInsideRoot(root, "/%")).toBeNull();
});
