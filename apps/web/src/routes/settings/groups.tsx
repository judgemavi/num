import { createFileRoute } from "@tanstack/react-router";
import { GroupsPage } from "@/settings/groups-page";

export const Route = createFileRoute("/settings/groups")({
  component: GroupsPage,
});
