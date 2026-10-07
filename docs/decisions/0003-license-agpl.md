# 0003 — License: AGPL-3.0

Writing standard: ASD-STE100.

Status: accepted
Date: 2026-10-07

## Context

- Num is a self-hosted app. People run it as a network service.
- With a permissive license, a person can run a changed copy as a hosted service and not publish the changes.

## Decision

- Use the GNU Affero General Public License, version 3 (`AGPL-3.0-only`).
- The full text is in `LICENSE`.
- Each `package.json` has `"license": "AGPL-3.0-only"`.

## Consequences

- If a person runs a changed copy as a network service, that person must give its users the source code.
- New dependencies must have a license that is compatible with AGPL-3.0.
  Do not add a dependency with an incompatible license.
