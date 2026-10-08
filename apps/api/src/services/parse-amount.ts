const amountPattern = /^(\d+)(?:\.(\d+))?$/;

export function parseMinorAmount(raw: string, digits: number): number | null {
  if (!Number.isInteger(digits) || digits < 0 || digits > 8) {
    throw new Error("Minor unit digits are not valid");
  }

  let text = raw.trim();
  if (text.length === 0) {
    return null;
  }

  let negative = false;
  if (text.startsWith("(") && text.endsWith(")")) {
    negative = true;
    text = text.slice(1, -1).trim();
  }

  text = text.replace(/[$£€\s]/g, "").replace(/,/g, "");
  if (text.startsWith("+")) {
    text = text.slice(1);
  }
  if (text.startsWith("-")) {
    negative = !negative;
    text = text.slice(1);
  }

  const match = amountPattern.exec(text);
  if (!match) {
    return null;
  }

  const fraction = match[2] ?? "";
  if (fraction.length > digits) {
    throw new Error("Amount has too many decimal places");
  }

  const scaled = BigInt(`${match[1]}${fraction.padEnd(digits, "0")}`);
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  if (scaled > max) {
    throw new Error("Amount is too large");
  }

  const minor = Number(scaled);
  return negative ? -minor : minor;
}
