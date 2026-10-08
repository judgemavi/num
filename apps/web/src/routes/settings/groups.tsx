import { createFileRoute } from "@tanstack/react-router";
import { editOnly } from "@/editors/page-search";
import { GroupsPage } from "@/settings/groups-page";

export const Route = createFileRoute("/settings/groups")({
  validateSearch: editOnly,
  component: GroupsPage,
});
