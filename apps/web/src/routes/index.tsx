import { createFileRoute } from "@tanstack/react-router";
import { startHomeReads } from "@/home/home-reads";
import { HomeScreen } from "@/home/home-screen";

export const Route = createFileRoute("/")({
  loader: ({ context }) => startHomeReads(context.queryClient),
  component: HomeScreen,
});
