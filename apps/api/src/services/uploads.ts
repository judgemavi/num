import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { uploadsDeferred } from "./work";

function storedFile(dataDir: string, hash: string): string {
  return join(dataDir, "uploads", hash);
}

export function writeUpload(dataDir: string, hash: string, bytes: Uint8Array): void {
  if (uploadsDeferred()) {
    return;
  }
  mkdirSync(join(dataDir, "uploads"), { recursive: true });
  writeFileSync(storedFile(dataDir, hash), bytes);
}

export function removeUpload(dataDir: string, hash: string): void {
  if (uploadsDeferred()) {
    return;
  }
  unlinkSync(storedFile(dataDir, hash));
}
