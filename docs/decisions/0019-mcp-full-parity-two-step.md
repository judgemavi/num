# 0019 — MCP: full parity with two-step writes

Writing standard: ASD-STE100.

Status: accepted
Date: 2026-10-08

## Context

The owner wants an AI to drive the whole app through MCP, with the same tools as the REST API, like v1. The owner also
wants the AI to propose first and act only after the user confirms. An AI can make mistakes, and a document that it
reads can contain hidden instructions.

## Decision

- Generate one MCP tool for each `@hono/zod-openapi` route; run it in-process through the same Hono app (MCP Hono adapter `@modelcontextprotocol/hono`, as in v1).
- Read tools run directly. Write tools need two steps: a dry-run preview that returns a confirmation token, then the
  same call with the token after the user confirms. The server refuses a write without a valid token (same inputs,
  unused, younger than 10 minutes).
- Pending previews are Proposals (spec §5.14). Annotations mark destructive tools. Setting `aiCanWrite` (default false).
- This replaces "MCP write tools create proposals only" (decision 0001) and the Inbox proposal design.

## Consequences

- Every write route needs a dry-run mode that changes nothing and returns what would change. Services get a
  "plan, then apply" shape where needed (import pipeline, group edits, funding, deletes).
- Migration: proposals table gets `token_hash`, `expires_at`; status values `pending | applied | expired`.
