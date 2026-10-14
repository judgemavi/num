import { useQuery } from "@tanstack/react-query";
import { aiAccessQuery, useSaveAiAccess } from "@/api/settings";
import { PageHeader } from "@/components/page-header";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { SettingsBack } from "@/settings/settings-nav";

export function AiAccessPage() {
  const setting = useQuery(aiAccessQuery());
  const save = useSaveAiAccess();

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
            onCheckedChange={(checked) => save.mutate(checked)}
          />
          <FieldDescription>
            When this is off, an AI can read the books and cannot change them. A change still needs your approval.
          </FieldDescription>
        </Field>
      ) : null}
      {save.isError ? <p role="alert">The setting did not save.</p> : null}
    </>
  );
}
