import { app } from "./app";

const port = Number(Bun.env.PORT ?? 3000);

console.log(`Num http://localhost:${port}`);

export default { port, fetch: app.fetch };

export type { AppType } from "./app";
