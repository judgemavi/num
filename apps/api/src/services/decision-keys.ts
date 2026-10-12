import { inboxDecisions } from "@num/db";
import { like } from "drizzle-orm";
import type { Db } from "../db";

/** Item keys that have a recorded no. Give a kind to read only the keys of that kind. */
export function decidedKeys(db: Db, kind?: string): Set<string> {
  const rows = kind
    ? db.select({ itemKey: inboxDecisions.itemKey }).from(inboxDecisions).where(like(inboxDecisions.itemKey, `${kind}:%`)).all()
    : db.select({ itemKey: inboxDecisions.itemKey }).from(inboxDecisions).all();
  return new Set(rows.map((row) => row.itemKey));
}

/** The item key of a transfer pair question. The smaller id comes first. */
export function pairKey(leftId: string, rightId: string): string {
  return leftId < rightId ? `transfer_pair:${leftId}:${rightId}` : `transfer_pair:${rightId}:${leftId}`;
}
