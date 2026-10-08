# 0011 — Backups now, deployment later

Writing standard: ASD-STE100.

Status: on hold (needs discussion with the owner)
Date: 2026-10-07

## Context

- The owner has not decided the hosting. Coolify is one possible choice.
- The owner will import real statements soon. Backups are necessary before that, on any host.

## Decision

- Backups (slice 0.6) and deployment (slice X.1) wait for a discussion with the owner.
- Deployment (Docker image, off-site backup, self-hosting guide) is a separate slice, X.1.
  It starts when the owner decides the hosting.

## Consequences

- The first 0.6 attempt (backups, Docker, self-hosting guide) is kept on the local branch `park/x.1-deploy-draft`.
