const PREFIXES: RegExp[] = [
  /^INTERAC\s+E-?TRANSFER(?:\s+TO)?\s+/,
  /^E-?TRANSFER(?:\s+TO)?\s+/,
  /^CARD\s+PAYMENT\s+TO\s+/,
  /^PRE-?AUTHORIZED(?:\s+(?:PAYMENT|DEBIT))?\s+/,
  /^SEPA(?:\s+LASTSCHRIFT)?\s+/,
  /^LASTSCHRIFT\s+/,
  /^PAIEMENT(?:\s+CARTE)?\s+/,
  /^ACHAT\s+/,
  /^VISA\s+DEBIT\s+/,
  /^DEBIT\s+CARD\s+/,
  /^POS\s+DEBIT\s+/,
  /^POS\s+PURCHASE\s+/,
  /^CHECKCARD\s+/,
  /^MASTERCARD\s+/,
  /^PURCHASE\s+/,
  /^PAYPAL\s*\*\s*/,
  /^PYPL\s*\*\s*/,
  /^PP\s*\*\s*/,
  /^SQ\s*\*\s*/,
  /^TST\s*\*\s*/,
  /^STRIPE\s*\*\s*/,
  /^GOOGLE\s*\*\s*/,
  /^VENMO\s*\*\s*/,
  /^APL\s*\*\s*/,
  /^CK\s*\*\s*/,
  /^SP\s+/,
  /^POS\s+/,
  /^ACH\s+/,
];

const REGIONS = new Set([
  "AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT",
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DC", "DE", "FL", "GA", "HI", "IA", "ID", "IL", "IN",
  "KS", "KY", "LA", "MA", "MD", "ME", "MI", "MN", "MO", "MS", "MT", "NC", "ND", "NE", "NH", "NJ",
  "NM", "NV", "NY", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VA", "VT", "WA",
  "WI", "WV", "WY", "NSW", "VIC", "QLD", "TAS", "ACT", "GB", "UK", "AU", "NZ", "IE", "FR", "ES",
  "IT", "NL", "BE", "SE", "NO", "DK", "FI", "JP", "MX", "IN", "SG", "HK", "US",
]);

function stripPrefixes(value: string): string {
  let current = value;
  for (let pass = 0; pass < 4; pass += 1) {
    const next = PREFIXES.reduce((text, prefix) => (prefix.test(text) ? text.replace(prefix, "") : text), current).trim();
    if (next === current) {
      return current;
    }
    current = next;
  }
  return current;
}

function stripNoise(value: string): string {
  return value
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ")
    .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, " ")
    .replace(/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g, " ")
    .replace(/[X*]{2,}\d{2,4}/g, " ")
    .replace(/\b\d{4}[X*]{2,}\d{0,4}\b/g, " ")
    .replace(/#\s*\d+\b/g, " ")
    .replace(
      /\b(?:STORE|TERMINAL|TERM|NO|LOCATION|BRANCH|REF|AUTH|APPROVAL|TRACE|SEQ|CONF|REFERENCE|INVOICE|INV)\s+#?\s*[A-Z0-9]*\d[A-Z0-9]*\b/g,
      " ",
    )
    .replace(/\b\d{7,}\b/g, " ")
    .replace(/[*#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripPlace(value: string): string {
  const words = value.split(" ").filter((word) => word.length > 0);
  const region = words.at(-1);
  if (!region || words.length < 2 || !REGIONS.has(region)) {
    return words.join(" ");
  }
  words.pop();
  return words.join(" ");
}

function tidy(value: string): string {
  return value.replace(/\s+/g, " ").trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

export function storedPayee(payeeRaw: string): { payeeRaw: string; payeeNormalized: string } {
  return { payeeRaw, payeeNormalized: normalizePayee(payeeRaw) };
}

/** Normalized payee for rules, history and merchant defaults (spec §7.3). */
export function normalizePayee(description: string): string {
  const upper = description.toUpperCase().replace(/[,'"`()]+/g, " ").replace(/\s+/g, " ").trim();
  return tidy(stripPlace(stripNoise(stripPrefixes(upper))));
}

function titleWord(word: string): string {
  const first = word.charAt(0).toLocaleUpperCase();
  return `${first}${word.slice(1).toLocaleLowerCase()}`;
}

/** A merchant name from bank text. "SQ *BLUE BOTTLE 0423" becomes "Blue Bottle". */
export function merchantNameFromPayee(description: string): string {
  const words = normalizePayee(description).split(" ").filter((word) => word.length > 0);
  while (words.length > 1 && /\d/.test(words[words.length - 1] ?? "")) {
    words.pop();
  }
  const name = words.map(titleWord).join(" ");
  if (!/\p{L}/u.test(name)) {
    return "";
  }
  return name;
}

export function uncategorizedLineKey(lineId: string): string {
  return `uncategorized:${lineId}`;
}
