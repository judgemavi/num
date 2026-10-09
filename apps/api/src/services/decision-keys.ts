import { inboxDecisions } from "@num/db";
import type { Db } from "../db";

/** Item keys that have a recorded no, for one kind of question. */
export function decidedKeysOf(db: Db, kind: string): Set<string> {
  const prefix = `${kind}:`;
  return new Set(
    db
      .select({ itemKey: inboxDecisions.itemKey })
      .from(inboxDecisions)
      .all()
      .map((row) => row.itemKey)
      .filter((key) => key.startsWith(prefix)),
  );
}
