import { milliPctToPercent, mortgageViewSchema, Temporal, toMinorUnits } from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { frequencyLabels } from "@/accounts/mortgage-format";
import { MortgageSchedule } from "@/accounts/mortgage-schedule";
import { useEditors } from "@/editors/editor-api";
import { localAsOf } from "@/as-of";
import { Amount } from "@/components/amount";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { DateField } from "@/components/date-field";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/money";
import { apiRequest } from "@/request";

function formatDay(iso: string): string {
  return Temporal.PlainDate.from(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function MortgagePanel({ accountId, currency }: { accountId: string; currency: string }) {
  const { openEditor } = useEditors();
  const asOf = localAsOf();
  const [extraText, setExtraText] = useState("");
  const [lumpText, setLumpText] = useState("");
  const [lumpDateText, setLumpDateText] = useState("");
  const [extra, setExtra] = useState(0);
  const [lumpSum, setLumpSum] = useState(0);
  const [lumpDate, setLumpDate] = useState("");
  const [extraError, setExtraError] = useState<string | null>(null);

  const view = useQuery({
    queryKey: ["mortgage-view", accountId, asOf, extra, lumpSum, lumpDate],
    queryFn: async () => {
      const params = new URLSearchParams({ asOf });
      if (extra > 0) {
        params.set("extra", String(extra));
      }
      if (lumpSum > 0 && lumpDate.length > 0) {
        params.set("lumpSum", String(lumpSum));
        params.set("lumpDate", lumpDate);
      }
      const result = await apiRequest(`/api/accounts/${accountId}/mortgage?${params.toString()}`, mortgageViewSchema);
      if (!result.ok) {
        if (result.code === "mortgage_terms_not_found") {
          return null;
        }
        throw new Error(result.code);
      }
      return result.data;
    },
  });

  function openTerms() {
    void openEditor("mortgage", { id: accountId });
  }

  if (view.isPending) {
    return <p className="text-muted-foreground">Loading the mortgage.</p>;
  }
  if (view.isError) {
    return <p>The mortgage did not load.</p>;
  }
  if (!view.data) {
    return (
      <Card>
        <CardHeader className="px-5 pt-5 pb-0">
          <CardTitle>Mortgage</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pt-4 pb-5">
          <Button type="button" onClick={openTerms}>Add mortgage terms</Button>
        </CardContent>
      </Card>
    );
  }

  const row = view.data;
  const rate = `${milliPctToPercent(row.rateMilliPct)}%`;

  function readExtra(text: string): number | null {
    if (text.trim().length === 0) {
      return 0;
    }
    try {
      const minor = toMinorUnits(currency, text.trim());
      if (minor < 0) {
        setExtraError("Enter the extra amount as a positive number.");
        return null;
      }
      return minor;
    } catch {
      setExtraError("Enter the extra amount as a number.");
      return null;
    }
  }

  function showExtra() {
    setExtraError(null);
    const perPayment = readExtra(extraText);
    const once = readExtra(lumpText);
    if (perPayment === null || once === null) {
      return;
    }
    if ((once > 0 && lumpDateText.length === 0) || (once === 0 && lumpDateText.length > 0)) {
      setExtraError("Enter the one-time extra and its date.");
      return;
    }
    setExtra(perPayment);
    setLumpSum(once);
    setLumpDate(lumpDateText);
  }

  return (
    <Card>
      <CardHeader className="px-5 pt-5 pb-0">
        <CardTitle>Mortgage</CardTitle>
        <CardAction>
          <Button type="button" variant="outline" onClick={openTerms}>Mortgage terms</Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4 px-5 pt-4 pb-5">
        <p className="text-sm">
          Balance <Amount currency={currency} minor={row.balance} owed />
          <span className="text-muted-foreground"> · {rate} · {frequencyLabels[row.paymentFrequency]}</span>
        </p>
        {row.payoffDate ? (
          <p className="text-sm">
            Payoff date {formatDay(row.payoffDate)}
            {row.payoffDate > row.termEnd ? <span className="text-muted-foreground">. This date uses the current rate after the term ends on {formatDay(row.termEnd)}.</span> : null}
          </p>
        ) : row.nonAmortizing ? (
          <p className="text-sm" role="alert">This payment does not cover the interest. Check the payment, rate and amount owed.</p>
        ) : (
          <p className="text-sm">This payment does not pay off the loan.</p>
        )}
        <MortgageSchedule currency={currency} asOf={asOf} payments={row.payments} actuals={row.actualPayments} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="mortgage-extra">Extra on each payment</FieldLabel>
            <Input id="mortgage-extra" inputMode="decimal" autoComplete="off" value={extraText} onChange={(event) => setExtraText(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="mortgage-lump">One-time extra</FieldLabel>
            <Input id="mortgage-lump" inputMode="decimal" autoComplete="off" value={lumpText} onChange={(event) => setLumpText(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="mortgage-lump-date">Date of the one-time extra</FieldLabel>
            <DateField id="mortgage-lump-date" value={lumpDateText} onChange={setLumpDateText} />
          </Field>
          <Button type="button" variant="outline" className="self-end" onClick={showExtra}>Show the effect</Button>
        </div>
        {extraError ? <p className="text-sm">{extraError}</p> : null}
        {row.extra ? (
          <p className="text-sm" role="status">
            {row.extra.payoffDate ? `New payoff date ${formatDay(row.extra.payoffDate)}.` : "The loan does not pay off with this extra amount."}
            {row.extra.interestSaved !== null ? ` Interest saved ${formatMoney(currency, row.extra.interestSaved)}.` : ""}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
