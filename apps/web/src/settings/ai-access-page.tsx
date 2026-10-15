import { useSuspenseQuery } from "@tanstack/react-query";
import { aiAccessQuery, useSaveAiAccess } from "@/api/settings";
import { Boundary } from "@/components/boundary";
import { PageHeader } from "@/components/page-header";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { SettingsBack } from "@/settings/settings-nav";

export function AiAccessPage() {
  return (
    <>
      <SettingsBack />
      <PageHeader kicker="Settings" title="AI access" />
      <Boundary loading="Loading AI access." failed="AI access did not load.">
        <AiAccessSetting />
      </Boundary>
    </>
  );
}

function AiAccessSetting() {
  const { data: setting } = useSuspenseQuery(aiAccessQuery());
  const save = useSaveAiAccess();

  return (
    <Field orientation="horizontal" className="max-w-xl">
      <FieldContent>
        <FieldLabel htmlFor="ai-can-write">Let an AI change the books</FieldLabel>
        <FieldDescription>When this is off, an AI can only read the books.</FieldDescription>
      </FieldContent>
      <Switch id="ai-can-write" checked={setting.aiCanWrite} onCheckedChange={(checked) => save.mutate(checked)} />
    </Field>
  );
}
