import { linkRefundIfSure } from "./refund-auto";
import { linkTransferIfSure } from "./transfer-auto";
import type { WriteTx } from "./write";

/** The links that the app makes by itself after a write. A read never calls this. */
export function linkAutomatic(tx: WriteTx, transactionId: string): void {
  linkRefundIfSure(tx, transactionId);
  linkTransferIfSure(tx, transactionId);
}
