/** A rail stays when only a code follows. A processor prefix always goes. */
const PREFIXES: { pattern: RegExp; rail: boolean }[] = [
  { pattern: /^INTERAC\s+E-?TRANSFER(?:\s+TO)?\s+/, rail: true },
  { pattern: /^E-?TRANSFER(?:\s+TO)?\s+/, rail: true },
  { pattern: /^CARD\s+PAYMENT\s+TO\s+/, rail: true },
  { pattern: /^PRE-?AUTHORIZED(?:\s+(?:PAYMENT|DEBIT))?\s+/, rail: true },
  { pattern: /^SEPA(?:\s+LASTSCHRIFT)?\s+/, rail: true },
  { pattern: /^LASTSCHRIFT\s+/, rail: true },
  { pattern: /^PAIEMENT(?:\s+CARTE)?\s+/, rail: true },
  { pattern: /^ACHAT\s+/, rail: true },
  { pattern: /^VISA\s+DEBIT\s+/, rail: true },
  { pattern: /^DEBIT\s+CARD\s+/, rail: true },
  { pattern: /^POS\s+DEBIT\s+/, rail: true },
  { pattern: /^POS\s+PURCHASE\s+/, rail: true },
  { pattern: /^CHECKCARD\s+/, rail: true },
  { pattern: /^MASTERCARD\s+/, rail: true },
  { pattern: /^PURCHASE\s+/, rail: true },
  { pattern: /^PAYPAL\s*\*\s*/, rail: false },
  { pattern: /^PYPL\s*\*\s*/, rail: false },
  { pattern: /^PP\s*\*\s*/, rail: false },
  { pattern: /^SQ\s*\*\s*/, rail: false },
  { pattern: /^TST\s*\*\s*/, rail: false },
  { pattern: /^STRIPE\s*\*\s*/, rail: false },
  { pattern: /^GOOGLE\s*\*\s*/, rail: false },
  { pattern: /^VENMO\s*\*\s*/, rail: false },
  { pattern: /^APL\s*\*\s*/, rail: false },
  { pattern: /^CK\s*\*\s*/, rail: false },
  { pattern: /^SP\s+/, rail: false },
  { pattern: /^POS\s+/, rail: false },
  { pattern: /^ACH\s+/, rail: false },
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
    let next = current;
    for (const prefix of PREFIXES) {
      if (!prefix.pattern.test(next)) {
        continue;
      }
      const remainder = next.replace(prefix.pattern, "").trim();
      if (prefix.rail && !hasRealWord(finish(remainder))) {
        return next;
      }
      next = remainder;
    }
    if (next === current) {
      return current;
    }
    current = next;
  }
  return current;
}

/** A per-payment code: 3+ letters and digits, with no hyphen or other mark. */
function isReferenceCode(token: string): boolean {
  return token.length >= 3 && /^[\p{L}\p{N}]+$/u.test(token) && /\p{L}/u.test(token) && /\p{N}/u.test(token);
}

/** * or XX at the start hides the rest of the token. Drop the whole token. */
function isMaskedToken(token: string): boolean {
  return /^\*/.test(token) || /^X{2,}/.test(token) || /^X+\*/.test(token);
}

function isStoreNumber(token: string): boolean {
  return /^\d+$/.test(token);
}

function hasRealWord(value: string): boolean {
  return value.split(" ").some((word) => /\p{L}{2,}/u.test(word) && !isReferenceCode(word) && !REGIONS.has(word));
}

function stripTrailingCodes(value: string): string {
  const words = value.split(" ").filter((word) => word.length > 0);
  while (words.length > 1 && (isReferenceCode(words[words.length - 1] ?? "") || isStoreNumber(words[words.length - 1] ?? ""))) {
    words.pop();
  }
  return words.join(" ");
}

function stripMaskedTokens(value: string): string {
  return value
    .split(" ")
    .filter((word) => word.length === 0 || !isMaskedToken(word))
    .join(" ");
}

function stripNoise(value: string): string {
  return stripMaskedTokens(value)
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ")
    .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, " ")
    .replace(/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g, " ")
    .replace(/[X*]{2,}\d{2,4}/g, " ")
    .replace(/\*{2,}[\p{L}\p{N}]+/gu, " ")
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

function finish(value: string): string {
  return tidy(stripTrailingCodes(stripPlace(stripNoise(value))));
}

export function storedPayee(payeeRaw: string): { payeeRaw: string; payeeNormalized: string } {
  return { payeeRaw, payeeNormalized: normalizePayee(payeeRaw) };
}

/** Normalized payee for rules, history and merchant defaults (spec §7.3). */
export function normalizePayee(description: string): string {
  const upper = description.toUpperCase().replace(/[,'"`()]+/g, " ").replace(/\s+/g, " ").trim();
  return finish(stripPrefixes(upper));
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
