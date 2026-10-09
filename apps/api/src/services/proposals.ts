import { createHash, randomBytes } from "node:crypto";
import { proposals } from "@num/db";
import { Temporal, utcNow } from "@num/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { write } from "./write";

const tokenMinutes = 10;

export const tokenRefusals = ["token_invalid", "token_expired", "token_used", "inputs_changed"] as const;

export type TokenRefusal = (typeof tokenRefusals)[number];

type ProposalRow = typeof proposals.$inferSelect;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function expired(expiresAt: string, now: string): boolean {
  return Temporal.Instant.compare(Temporal.Instant.from(expiresAt), Temporal.Instant.from(now)) <= 0;
}

export function storeProposal(
  db: Db,
  input: { kind: string; payload: string; at?: string },
): { id: string; token: string } {
  const at = input.at ?? utcNow();
  const id = crypto.randomUUID();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = Temporal.Instant.from(at).add({ minutes: tokenMinutes }).toString();
  write(db, { source: "mcp", at }, (tx) => {
    tx.insert(proposals)
      .values({
        id,
        kind: input.kind,
        payloadJson: input.payload,
        source: "mcp",
        status: "pending",
        tokenHash: hashToken(token),
        expiresAt,
        resultRef: null,
        createdAt: at,
        decidedAt: null,
      })
      .run();
    tx.audit({
      entity: "proposals",
      entityId: id,
      action: "create",
      before: null,
      after: { kind: input.kind, status: "pending", expiresAt },
    });
  });
  return { id, token };
}

function byHash(db: Db, token: string): ProposalRow | undefined {
  return db.select().from(proposals).where(eq(proposals.tokenHash, hashToken(token))).get();
}

function markExpired(db: Db, row: ProposalRow): void {
  if (row.status !== "pending") {
    return;
  }
  const decidedAt = utcNow();
  write(db, { source: "mcp", at: decidedAt }, (tx) => {
    const current = tx.select().from(proposals).where(eq(proposals.id, row.id)).get();
    if (!current || current.status !== "pending") {
      throw new Error("Proposal is not pending");
    }
    tx.update(proposals).set({ status: "expired", decidedAt }).where(eq(proposals.id, row.id)).run();
    tx.audit({
      entity: "proposals",
      entityId: row.id,
      action: "expire",
      before: { status: current.status },
      after: { status: "expired" },
    });
  });
}

export function checkToken(
  db: Db,
  token: string,
  kind: string,
  payload: string,
): { ok: true; id: string } | { ok: false; code: TokenRefusal } {
  const row = byHash(db, token);
  if (!row || row.kind !== kind) {
    return { ok: false, code: "token_invalid" };
  }
  if (row.status === "applied") {
    return { ok: false, code: "token_used" };
  }
  const now = utcNow();
  if (row.status === "expired" || expired(row.expiresAt, now)) {
    markExpired(db, row);
    return { ok: false, code: "token_expired" };
  }
  if (row.payloadJson !== payload) {
    return { ok: false, code: "inputs_changed" };
  }
  return { ok: true, id: row.id };
}

export function markApplied(db: Db, id: string, resultRef: string | null): void {
  const decidedAt = utcNow();
  write(db, { source: "mcp", at: decidedAt }, (tx) => {
    const current = tx.select().from(proposals).where(eq(proposals.id, id)).get();
    if (!current || current.status !== "pending") {
      throw new Error("Proposal is not pending");
    }
    tx.update(proposals)
      .set({ status: "applied", decidedAt, resultRef })
      .where(eq(proposals.id, id))
      .run();
    tx.audit({
      entity: "proposals",
      entityId: id,
      action: "apply",
      before: { status: current.status, resultRef: current.resultRef },
      after: { status: "applied", resultRef },
    });
  });
}
