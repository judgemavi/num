import { aiAccessSettingSchema } from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/request";
import { SettingsBack } from "@/settings/settings-nav";

export function AiAccessPage() {
  const queryClient = useQueryClient();
  const setting = useQuery({
    queryKey: ["ai-access"],
    queryFn: async () => {
      const result = await apiRequest("/api/settings/ai", aiAccessSettingSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data;
    },
  });
  const [error, setError] = useState<string | null>(null);

  async function save(aiCanWrite: boolean) {
    const result = await apiRequest("/api/settings/ai", aiAccessSettingSchema, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ aiCanWrite }),
    });
    if (!result.ok) {
      setError("The setting did not save.");
      return;
    }
    setError(null);
    await queryClient.invalidateQueries({ queryKey: ["ai-access"] });
  }

  return (
    <>
      <SettingsBack />
      <PageHeader kicker="Settings" title="AI access" />
      {setting.isPending ? <p className="text-muted-foreground">Loading AI access.</p> : null}
      {setting.data ? (
        <Field orientation="horizontal">
          <FieldLabel htmlFor="ai-can-write">Let an AI change the books</FieldLabel>
          <Switch
            id="ai-can-write"
            checked={setting.data.aiCanWrite}
            onCheckedChange={(checked) => void save(checked)}
          />
          <FieldDescription>
            When this is off, an AI can read the books and cannot change them. A change still needs your approval.
          </FieldDescription>
        </Field>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </>
  );
}
