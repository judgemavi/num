import { confidenceModes, type ConfidenceMode } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { matchingSettingQuery, useSaveMatchingSetting } from "@/api/settings";
import { Boundary } from "@/components/boundary";
import { PageHeader } from "@/components/page-header";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsBack } from "@/settings/settings-nav";

const labels: Record<ConfidenceMode, string> = {
  careful: "Only when very sure",
  balanced: "When sure",
  eager: "More often",
};

export function MatchingPage() {
  return (
    <>
      <SettingsBack />
      <PageHeader kicker="Settings" title="Matching" />
      <Boundary loading="Loading matching." failed="Matching did not load.">
        <MatchingSetting />
      </Boundary>
    </>
  );
}

function MatchingSetting() {
  const { data: setting } = useSuspenseQuery(matchingSettingQuery());
  const save = useSaveMatchingSetting();

  function change(value: string) {
    const mode = confidenceModes.find((item) => item === value);
    if (mode) {
      save.mutate(mode);
    }
  }

  return (
    <>
      <Field>
        <FieldLabel htmlFor="auto-confidence">Label for me</FieldLabel>
        <Select value={setting.autoConfidence} onValueChange={change}>
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
        <FieldDescription>Only when very sure, when sure, or more often. The app never shows a percentage.</FieldDescription>
      </Field>
      {save.isError ? <p role="alert">The setting did not save.</p> : null}
    </>
  );
}
