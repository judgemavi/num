import { confidenceModes, type ConfidenceMode } from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { matchingSettingQuery, useSaveMatchingSetting } from "@/api/settings";
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
  const setting = useQuery(matchingSettingQuery());
  const save = useSaveMatchingSetting();

  function change(value: string) {
    const mode = confidenceModes.find((item) => item === value);
    if (mode) {
      save.mutate(mode);
    }
  }

  return (
    <>
      <SettingsBack />
      <PageHeader kicker="Settings" title="Matching" />
      {setting.isPending ? <p className="text-muted-foreground">Loading matching.</p> : null}
      {setting.data ? (
        <Field>
          <FieldLabel htmlFor="auto-confidence">Label for me</FieldLabel>
          <Select value={setting.data.autoConfidence} onValueChange={change}>
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
      ) : null}
      {save.isError ? <p role="alert">The setting did not save.</p> : null}
    </>
  );
}
