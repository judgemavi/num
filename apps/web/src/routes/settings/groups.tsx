import { groupListQuery } from "@/api/categories";
import { createFileRoute } from "@tanstack/react-router";
import { GroupsPage } from "@/settings/groups-page";

export const Route = createFileRoute("/settings/groups")({
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(groupListQuery());
  },
  component: GroupsPage,
});
