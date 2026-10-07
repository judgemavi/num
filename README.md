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
