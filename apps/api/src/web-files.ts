import { stat } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const distDir = fileURLToPath(new URL("../../web/dist/", import.meta.url));

export function pathInsideRoot(root: string, pathname: string) {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) {
    return null;
  }
  const base = normalize(root);
  const full = normalize(join(base, decoded));
  if (full !== base && !full.startsWith(base.endsWith(sep) ? base : base + sep)) {
    return null;
  }
  return full;
}

export async function webFile(pathname: string) {
  const full = pathInsideRoot(distDir, pathname);
  if (!full || !(await isFile(full))) {
    return null;
  }
  return Bun.file(full);
}

export function webIndex() {
  return Bun.file(join(distDir, "index.html"));
}

export function hasFileExtension(pathname: string) {
  const name = pathname.slice(pathname.lastIndexOf("/") + 1);
  return name.includes(".");
}

async function isFile(path: string) {
  const info = await stat(path).catch(() => null);
  return info?.isFile() ?? false;
}
