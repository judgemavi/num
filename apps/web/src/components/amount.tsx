import { useBookCurrency } from "@/editors/lookups";
import { formatMoney, moneyParts } from "@/money";

type AmountProps = {
  value: number;
  owed?: boolean;
  hero?: boolean;
  className?: string;
};

/**
 * An amount of money in the book currency. It reads the currency itself. Inside a secondary line (`<small>`) it takes
 * the size and the weight of that line.
 */
export function Amount({ value, owed = false, hero = false, className }: AmountProps) {
  const currency = useBookCurrency();
  const showOwed = owed && value < 0;
  const signed = showOwed ? -value : value;
  if (!hero) {
    return (
      <span className={`text-base font-semibold tabular-nums in-[small]:[font-size:inherit] in-[small]:[font-weight:inherit] in-[small]:[line-height:inherit] ${className ?? ""}`}>
        {showOwed ? <span className="mr-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Owed</span> : null}
        {formatMoney(currency, signed)}
      </span>
    );
  }
  const parts = moneyParts(currency, signed < 0 ? -signed : signed);
  return (
    <span className={`mt-1 inline-flex items-start font-display text-[60px] leading-none font-extrabold whitespace-nowrap tabular-nums [font-stretch:72%] max-md:text-5xl ${className ?? ""}`}>
      {showOwed ? <span className="mr-1.5 self-center text-xs font-semibold tracking-wide text-muted-foreground uppercase">Owed</span> : null}
      {signed < 0 ? <span className="self-center">−</span> : null}
      <span className="mr-1 pt-[0.28em] text-[0.5em] leading-none font-semibold">{parts.currency}</span>
      <span className="leading-none">{parts.integer}</span>
      {parts.fraction.length > 0 ? <span className="ml-px pt-[0.55em] text-[0.42em] leading-none">{parts.fraction}</span> : null}
    </span>
  );
}
