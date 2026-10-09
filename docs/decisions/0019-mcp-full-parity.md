# 0019 — MCP: full parity with the UI

Writing standard: ASD-STE100.

Status: accepted (revised 2026-10-08)
Date: 2026-10-08

## Context

The owner wants an AI to do through MCP exactly what the user can do in the UI, like v1. A first version of this
decision added dry-run previews and confirmation tokens. The server cannot prove that a person confirmed, so the
tokens did not add safety. That version is replaced.

## Decision

- Generate one MCP tool for each `@hono/zod-openapi` route. Run it in-process through the same Hono app with the MCP
  Hono adapter (`@modelcontextprotocol/hono`, as in v1).
- Confirmation is the job of the MCP client: tool annotations mark writes as destructive, and the client asks the user.
- Setting `aiCanWrite` (default false) is the server control. Audit source `mcp` and undo work as for the UI.
- Proposals are removed (spec §5.14). An import batch always has a document. This replaces "MCP write tools create
  proposals only" (decision 0001).

## Consequences

- No dry run, no tokens, no proposal table.
- Migration: drop `proposals` and `import_batches.proposal_id`.
