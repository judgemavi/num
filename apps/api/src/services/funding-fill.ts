import { bucketEvents, settings } from "@num/db";
import { monthStart, isIsoDate, type FillResult } from "@num/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { coverEvents, type FillEvent } from "./funding-covers";
import { fundingPlan } from "./funding-plan";
import { withoutId, write, type Reader, type WriteInput, type WriteTx } from "./write";

function requireSetup(db: Reader) {
  if (!db.select().from(settings).where(eq(settings.key, "currency")).get()) {
    throw new ServiceError("setup_required", 409);
  }
}

/**
 * The owed amounts of the month of `asOf`, in the shared three-pass order, from Unassigned. It reads the covers of
 * the month, thus the covers are written first. An owed amount never causes a recede.
 */
function fundEvents(db: Reader, asOf: string): FillEvent[] {
  const month = asOf.slice(0, 7);
  return fundingPlan(db, asOf).map(({ bucketId, amount }) => ({
    kind: "fund", bucketId, otherBucketId: null, amount, month,
  }));
}

/** Write events of the fill. Each event has the date of the first day of the month of `asOf`. */
function writeEvents(tx: WriteTx, asOf: string, events: readonly FillEvent[]) {
  const date = monthStart(asOf.slice(0, 7));
  for (const planned of events) {
    const event = { id: crypto.randomUUID(), ...planned, date, undoneAt: null };
    tx.insert(bucketEvents).values(event).run();
    tx.audit({ entity: "bucket_events", entityId: event.id, action: "create", before: null, after: withoutId(event) });
  }
}

/** The covers and recedes first, then the owed amounts from the balances after them. */
function fillInTx(tx: WriteTx, asOf: string): FillResult {
  requireSetup(tx);
  const covers = coverEvents(tx, asOf);
  writeEvents(tx, asOf, covers);
  const funds = fundEvents(tx, asOf);
  writeEvents(tx, asOf, funds);
  return { paid: funds.reduce((sum, event) => sum + event.amount, 0), payments: covers.length + funds.length };
}

/** True when a fill would write. With no cover, the owed amounts read the same balances as in the write. */
function fillNeeded(db: Reader, asOf: string): boolean {
  requireSetup(db);
  return coverEvents(db, asOf).length > 0 || fundEvents(db, asOf).length > 0;
}

/** The fill: one write with `asOf` from the request. It writes nothing when nothing is owed or covered (it is idempotent). */
export function fillBuckets(db: Db, input: WriteInput & { asOf: string }): FillResult {
  if (!isIsoDate(input.asOf)) {
    throw new ServiceError("as_of_invalid", 400, { asOf: input.asOf });
  }
  if (!fillNeeded(db, input.asOf)) {
    return { paid: 0, payments: 0 };
  }
  return write(db, { source: input.source, at: input.at }, (tx) => fillInTx(tx, input.asOf));
}
