import { accountListSchema, forecastSchema } from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { accountLabels } from "@/accounts/label";
import { localAsOf } from "@/as-of";
import { ForecastChart } from "@/plan/forecast-chart";
import { apiRequest } from "@/request";
import { loadAllPages } from "@/settings/load-all-pages";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function ForecastPanel({ currency }: { currency: string }) {
  const asOf = localAsOf();
  const [accountId, setAccountId] = useState("total");
  const accounts = useQuery({
    queryKey: ["accounts", "forecast"],
    queryFn: () => loadAllPages("/api/accounts", accountListSchema, { archived: false, sort: "name", dir: "asc" }),
  });
  const forecast = useQuery({
    queryKey: ["forecast", asOf],
    queryFn: async () => {
      const result = await apiRequest(`/api/forecast?asOf=${asOf}`, forecastSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data;
    },
  });
  const names = accountLabels(accounts.data?.items ?? []);
  const selected = forecast.data?.accounts.find((account) => account.accountId === accountId);
  const series = selected ?? forecast.data?.total;
  const lowest = selected?.lowest ?? forecast.data?.lowest;
  return (
    <Card>
      <CardContent className="grid gap-4 p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold">Forecast</h2>
          <Select value={selected ? accountId : "total"} onValueChange={setAccountId}>
            <SelectTrigger className="w-56" aria-label="Account">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="total">On-budget total</SelectItem>
              {(forecast.data?.accounts ?? []).map((account) => (
                <SelectItem key={account.accountId} value={account.accountId}>
                  {names.get(account.accountId) ?? "Account"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {forecast.isError ? (
          <Button type="button" onClick={() => void forecast.refetch()}>
            Try again
          </Button>
        ) : null}
        {forecast.data && series && lowest ? (
          <ForecastChart currency={currency} dates={forecast.data.dates} known={series.known} estimated={series.estimated} lowest={lowest} />
        ) : (
          <p className="text-muted-foreground">Loading the forecast.</p>
        )}
      </CardContent>
    </Card>
  );
}
