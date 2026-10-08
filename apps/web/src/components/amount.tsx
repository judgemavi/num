import { formatMoney, moneyParts } from "@/money";

type AmountProps = {
  currency: string;
  minor: number;
  owed?: boolean;
  hero?: boolean;
};

export function Amount({ currency, minor, owed = false, hero = false }: AmountProps) {
  const showOwed = owed && minor < 0;
  const signed = showOwed ? -minor : minor;
  if (!hero) {
    return (
      <span className="amt">
        {showOwed ? <span className="owed">Owed</span> : null}
        {formatMoney(currency, signed)}
      </span>
    );
  }
  const parts = moneyParts(currency, signed < 0 ? -signed : signed);
  return (
    <span className="hero amt">
      {showOwed ? <span className="owed">Owed</span> : null}
      {signed < 0 ? "−" : null}
      <span className="cur">{parts.currency}</span>
      {parts.integer}
      {parts.fraction.length > 0 ? <sup>{parts.fraction}</sup> : null}
    </span>
  );
}
