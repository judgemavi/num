import { migrateDatabase } from "@num/db";
import { createApp, serveWeb } from "./app";
import { dataDirectory, openAppDb } from "./db";
import { listenAddress } from "./listen";

const dataDir = dataDirectory(Bun.env.DATA_DIR);
const { sqlite, db } = openAppDb(Bun.env.DATA_DIR);
migrateDatabase(sqlite);

const { hostname, port } = listenAddress({
  HOST: Bun.env.HOST,
  PORT: Bun.env.PORT,
});

const app = serveWeb(createApp(db, { dataDir }));

console.log(`Num http://${hostname}:${port}`);

export default { hostname, port, fetch: app.fetch };
