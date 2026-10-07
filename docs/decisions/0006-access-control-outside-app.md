# 0006 — Access control is outside the app

Writing standard: ASD-STE100.

Status: accepted
Date: 2026-10-07

## Context

- The owner runs Num on a private server. The server has no public access.
- The owner reaches Num only through Cloudflare Tunnel. Cloudflare Access protects the web app.
- AI clients reach MCP only through the Cloudflare MCP portal. Cloudflare Access also protects it.
- Thus, the network and the proxy control access. Auth in the app gives no more protection in this setup.

## Decision

- Num has no login, no users, no sessions and no API tokens.
- Access control is the responsibility of the operator. The operator runs Num on a private network
  and puts an authenticating proxy in front of all remote access.
- The server listens on `127.0.0.1` by default. The Docker image sets `HOST=0.0.0.0`.
- `docs/self-hosting.md` starts with a warning: do not expose Num without an authenticating proxy.
- This decision replaces the auth modes in decision 0002.

## Consequences

- Roadmap slice 0.3 (auth) is removed. Setup (§7.0) has no password step.
- If a path reaches the app without the proxy, there is no second barrier.
  The deploy slice (0.6) includes a check that the app is not reachable that way.
- Other operators can use any proxy: Cloudflare Access, Authelia, Authentik, Tailscale and others.
