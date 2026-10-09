import { confidenceModes, matchingSettingSchema, type ConfidenceMode } from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/request";
import { SettingsBack } from "@/settings/settings-nav";

const labels: Record<ConfidenceMode, string> = {
  careful: "Careful",
  balanced: "Balanced",
  eager: "Eager",
};

export function MatchingPage() {
  const queryClient = useQueryClient();
  const setting = useQuery({
    queryKey: ["matching-setting"],
    queryFn: async () => {
      const result = await apiRequest("/api/settings/matching", matchingSettingSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data;
    },
  });
  const [error, setError] = useState<string | null>(null);

  async function save(value: string) {
    if (!(confidenceModes as readonly string[]).includes(value)) {
      return;
    }
    const result = await apiRequest("/api/settings/matching", matchingSettingSchema, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ autoConfidence: value }),
    });
    if (!result.ok) {
      setError("The setting did not save.");
      return;
    }
    setError(null);
    await queryClient.invalidateQueries({ queryKey: ["matching-setting"] });
  }

  return (
    <>
      <SettingsBack />
      <PageHeader kicker="Settings" title="Matching" />
      {setting.isPending ? <p className="text-muted-foreground">Loading matching.</p> : null}
      {setting.data ? (
        <Field>
          <FieldLabel htmlFor="auto-confidence">When to label automatically</FieldLabel>
          <Select value={setting.data.autoConfidence} onValueChange={(value) => void save(value)}>
            <SelectTrigger id="auto-confidence" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {confidenceModes.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {labels[mode]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>Careful waits until the app is very sure. Eager labels sooner. Balanced is the default.</FieldDescription>
        </Field>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </>
  );
}
