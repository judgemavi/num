import { createFileRoute } from "@tanstack/react-router";
import { BackupPage } from "@/settings/backup-page";
import { editOnly } from "@/editors/page-search";

export const Route = createFileRoute("/settings/backup")({
  validateSearch: editOnly,
  component: BackupPage,
});
