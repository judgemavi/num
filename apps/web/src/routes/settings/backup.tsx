import { createFileRoute } from "@tanstack/react-router";
import { BackupPage } from "@/settings/backup-page";

export const Route = createFileRoute("/settings/backup")({
  component: BackupPage,
});
