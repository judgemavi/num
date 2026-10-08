import { formatMoney, moneyParts } from "@/money";

type AmountProps = {
  currency: string;
  minor: number;
  owed?: boolean;
  hero?: boolean;
  className?: string;
};

export function Amount({ currency, minor, owed = false, hero = false, className }: AmountProps) {
  const showOwed = owed && minor < 0;
  const signed = showOwed ? -minor : minor;
  if (!hero) {
    return (
      <span className={`text-base font-semibold tabular-nums ${className ?? ""}`}>
        {showOwed ? <span className="mr-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Owed</span> : null}
        {formatMoney(currency, signed)}
      </span>
    );
  }
  const parts = moneyParts(currency, signed < 0 ? -signed : signed);
  return (
    <span className="font-display text-[60px] leading-[0.9] font-extrabold whitespace-nowrap tabular-nums [font-stretch:72%] max-md:text-5xl">
      {showOwed ? <span className="mr-1.5 align-middle text-xs font-semibold tracking-wide text-muted-foreground uppercase">Owed</span> : null}
      {signed < 0 ? "−" : null}
      <span className="mr-0.5 align-[0.8em] text-[0.5em] font-semibold">{parts.currency}</span>
      {parts.integer}
      {parts.fraction.length > 0 ? <sup className="ml-px align-[1.05em] text-[0.42em]">{parts.fraction}</sup> : null}
    </span>
  );
}
