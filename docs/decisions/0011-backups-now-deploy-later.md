# 0011 — Backups now, deployment later

Writing standard: ASD-STE100.

Status: accepted
Date: 2026-10-07

## Context

- The owner has not decided the hosting. Coolify is one possible choice.
- The owner will import real statements soon. Backups are necessary before that, on any host.

## Decision

- Slice 0.6 contains only backups: the pre-migrate copy and "Download backup".
- Deployment (Docker image, off-site backup, self-hosting guide) is a separate slice, X.1.
  It starts when the owner decides the hosting.

## Consequences

- The Docker and self-hosting work from the first 0.6 attempt is kept on a parked branch for slice X.1.
