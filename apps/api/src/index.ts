import { app } from "./app";
import { openAppDb } from "./db";
import { listenAddress } from "./listen";

export const db = openAppDb();

const { hostname, port } = listenAddress({
  HOST: Bun.env.HOST,
  PORT: Bun.env.PORT,
});

console.log(`Num http://${hostname}:${port}`);

export default { hostname, port, fetch: app.fetch };

export type { AppType } from "./app";
