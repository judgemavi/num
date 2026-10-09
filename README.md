# Num

Num is an open-source app. You run it on your computer or on a server.
One instance serves one person.

Num helps you to:

- Know where your money goes.
- Plan future spending.
- Keep good financial hygiene.

## License

Num uses the GNU Affero General Public License, version 3. See `LICENSE`.

## Requirements

- [Bun](https://bun.sh)

## Start the app

From the repository root:

```sh
bun install
bun run --filter web build
bun run --filter api start
```

One process serves the web app and the API on port 3000.
The health route is `GET /api/health`.

Set `PORT` to use a different port.

## MCP

The API serves MCP at `/mcp` on the same process.
The transport is streamable HTTP.

Set the client URL to `http://127.0.0.1:3000/mcp`.
Use your `PORT` value when the port is not 3000.

Num has no login and no token.
Run Num on a private network.
Put an authenticating proxy in front of remote access.
The Cloudflare MCP portal with Cloudflare Access is one example.

Each API route is one MCP tool.
A read tool runs at once.
A write tool has two steps:

1. Call the tool with no token.
   The server changes nothing.
   It returns a preview and a confirmation token.
   The token expires after 10 minutes.
2. Show that preview to the person.
   After the person approves it, call the same tool with the same inputs and the token.
   The server applies that change.

Do not retry a write after an uncertain response.
Read the current state first.
A 409 is a conflict to resolve.
It is not permission to force the write.

AI writes are off by default.
Open Settings, then AI access, and turn on "Let an AI change the books".
Until you do, the server lists read tools only and refuses write calls.

Amounts are integer minor units.
Money that enters an account is positive.

## Checks

```sh
bun test
bun run --filter api typecheck
bun run --filter web build
bun run --filter web lint
```

## Documents

- `docs/spec.md` tells what the app is.
- `docs/roadmap.md` gives the build order.
- `CONTRIBUTING.md` tells how to contribute.
