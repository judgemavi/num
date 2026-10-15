import { Temporal } from "@num/shared";
import { localAsOf } from "@/as-of";
import { Boundary } from "@/components/boundary";
import { PageHeader } from "@/components/page-header";
import { AvailableStrip } from "@/home/available-strip";
import { NeedsYouCard } from "@/home/needs-you-card";
import { SpendingSection } from "@/home/spending-section";

/**
 * Home: Available to spend, the items that need the user, and Spending. Each part reads its own data and
 * shows its own loading text and error. The loader of the route starts the reads together (`home-reads.ts`).
 */
export function HomeScreen() {
  return (
    <>
      <PageHeader kicker={Temporal.PlainDate.from(localAsOf()).toLocaleString(undefined, { weekday: "long", month: "long", day: "numeric" })} title="Home" />
      <Boundary loading="Loading Available to spend." failed="Available to spend did not load.">
        <AvailableStrip />
      </Boundary>
      <Boundary loading="Loading Needs you." failed="Needs you did not load.">
        <NeedsYouCard />
      </Boundary>
      <SpendingSection />
    </>
  );
}
