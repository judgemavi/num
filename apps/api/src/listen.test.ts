import { expect, test } from "bun:test";
import { listenAddress } from "./listen";

test("the server listens on 127.0.0.1 and port 3000 by default", () => {
  expect(listenAddress({})).toEqual({ hostname: "127.0.0.1", port: 3000 });
  expect(listenAddress({ HOST: "  ", PORT: "" })).toEqual({ hostname: "127.0.0.1", port: 3000 });
});

test("HOST and PORT set the listen address", () => {
  expect(listenAddress({ HOST: "0.0.0.0", PORT: "8080" })).toEqual({
    hostname: "0.0.0.0",
    port: 8080,
  });
});

test("a PORT that is not an integer is rejected", () => {
  expect(() => listenAddress({ PORT: "nope" })).toThrow("PORT must be an integer from 0 to 65535");
  expect(() => listenAddress({ PORT: "65536" })).toThrow("PORT must be an integer from 0 to 65535");
});
