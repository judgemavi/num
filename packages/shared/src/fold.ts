/** The unique name key keeps accents and ignores case after NFC normalization. */
export function nameKey(name: string): string {
  return name.normalize("NFC").toLowerCase();
}

/**
 * The folded form of a name, for sorting and searching: Unicode NFKD, no combining marks, lower case.
 * "École" gives "ecole". SQLite cannot do this, thus the app stores the result in a column.
 */
export function foldName(name: string): string {
  return name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}
