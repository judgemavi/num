export const recordEditorKinds = [
  "transaction",
  "account",
  "category",
  "group",
  "tag",
  "merchant",
  "rule",
  "bucket",
  "plan",
] as const;

export type RecordEditorKind = (typeof recordEditorKinds)[number];

const kindSet = new Set<string>(recordEditorKinds);

export type EditTarget = {
  kind: RecordEditorKind;
  id: string | null;
};

export function isRecordEditorKind(kind: string): kind is RecordEditorKind {
  return kindSet.has(kind);
}

export function formatEditParam(kind: RecordEditorKind, id: string | null): string {
  return `${kind}:${id ?? "new"}`;
}

export function parseEditParam(value: string | null | undefined): EditTarget | null {
  if (!value) {
    return null;
  }
  const split = value.indexOf(":");
  if (split <= 0) {
    return null;
  }
  const kind = value.slice(0, split);
  const idPart = value.slice(split + 1);
  if (!isRecordEditorKind(kind) || idPart.length === 0 || idPart.includes(":")) {
    return null;
  }
  return { kind, id: idPart === "new" ? null : idPart };
}
