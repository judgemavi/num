import { PageHeader } from "@/components/page-header";
import { SettingsBack } from "@/settings/settings-nav";

export function BackupPage() {
  return (
    <>
      <SettingsBack />
      <PageHeader kicker="Settings" title="Backup" />
      <p className="text-muted-foreground">The backup download is added with the install guide.</p>
    </>
  );
}
