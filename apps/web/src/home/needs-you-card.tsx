import { reviewAgeDays, staleImportDays, type NeedsYouItem } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { CalendarX, ChevronRight, CircleAlert, Landmark, LifeBuoy, ListChecks, PiggyBank, ReceiptText, Target, Upload } from "lucide-react";
import { needsYouQuery } from "@/api/needs-you";
import { localAsOf } from "@/as-of";
import type { Hue } from "@/components/hue";
import { IconTile } from "@/components/icon-tile";
import { ListCard, ListRow, listName } from "@/components/list-card";
import { Badge } from "@/components/ui/badge";
import { useAccountLabels, useActiveSchedules, useBookCurrency, useBucketNames } from "@/editors/lookups";
import { rateText } from "@/home/spending/format";
import { formatMoney } from "@/money";
import { formatDate } from "@/date-format";

type Row = {
  key: string;
  hue: Hue | "attention";
  icon: LucideIcon;
  title: string;
  detail: string | null;
  open: () => void;
};

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** The rows of the items. Home is read-only: each row opens the screen of its fix. */
function useRows(items: readonly NeedsYouItem[]): Row[] {
  const go = useNavigate();
  const currency = useBookCurrency();
  const money = (value: number) => formatMoney(currency, value);
  const accountLabels = useAccountLabels();
  const schedules = useActiveSchedules();
  const bucketNames = useBucketNames();
  const bucketName = (id: string) => bucketNames.get(id) ?? "Bucket";
  const toBuckets = () => void go({ to: "/buckets" });

  return items.flatMap((item): Row[] => {
    switch (item.code) {
      case "review":
        return [{
          key: item.code,
          hue: "sky",
          icon: ListChecks,
          title: `${plural(item.count, "transaction needs", "transactions need")} review`,
          detail: item.oldCount > 0 ? `${item.oldCount} older than ${reviewAgeDays} days` : null,
          open: () => void go({ to: "/transactions/review" }),
        }];
      case "imports_review":
        return [{
          key: item.code,
          hue: "teal",
          icon: Upload,
          title: `${plural(item.count, "import needs", "imports need")} review`,
          detail: null,
          open: () => void go({ to: "/accounts/imports", search: { status: "needs_you" } }),
        }];
      case "bank_mismatch":
        return [{
          key: `${item.code}-${item.accountId}`,
          hue: "attention",
          icon: Landmark,
          title: accountLabels.get(item.accountId) ?? "Account",
          detail: `${money(Math.abs(item.difference))} different from your bank`,
          open: () => void go({ to: "/accounts/$accountId", params: { accountId: item.accountId } }),
        }];
      case "imports_stale":
        return [{
          key: item.code,
          hue: "teal",
          icon: Upload,
          title: `Imports are older than ${staleImportDays} days`,
          detail: item.items.map((row) => `${accountLabels.get(row.accountId) ?? "Account"} · ${plural(row.ageDays, "day", "days")}`).join(", "),
          open: () => void go({ to: "/accounts/imports" }),
        }];
      case "missed": {
        const schedule = schedules.find((row) => row.id === item.bucketId);
        if (!schedule) {
          return [];
        }
        return [{
          key: `${item.code}-${item.bucketId}-${item.dueDate}`,
          hue: "lilac",
          icon: CalendarX,
          title: schedule.name,
          detail: `Missed payment · due ${formatDate(item.dueDate)}`,
          open: toBuckets,
        }];
      }
      case "bills_short":
        return [{
          key: `${item.code}-${item.bucketId}`,
          hue: "attention",
          icon: ReceiptText,
          title: `${bucketName(item.bucketId)} is ${money(item.short)} short for ${formatDate(item.dueDate)}`,
          detail: null,
          open: toBuckets,
        }];
      case "overspent":
        return [{
          key: item.code,
          hue: "attention",
          icon: CircleAlert,
          title: `${plural(item.count, "bucket is", "buckets are")} below zero`,
          detail: `Over by ${money(-item.balance)}`,
          open: toBuckets,
        }];
      case "goals_short":
        return [{
          key: item.code,
          hue: "mint",
          icon: Target,
          title: "Goals do not fit your monthly income",
          detail: `${money(item.shortfall)} short each month`,
          open: toBuckets,
        }];
      case "emergency_fund":
        return [{
          key: item.code,
          hue: "pink",
          icon: LifeBuoy,
          title: "Emergency fund below its target",
          detail: `${money(item.balance)} of ${money(item.target)} · ${plural(item.months, "month", "months")} of essential spending`,
          open: toBuckets,
        }];
      case "savings_used":
        return [{
          key: item.code,
          hue: "pink",
          icon: LifeBuoy,
          title: "Savings used",
          detail: [`${money(item.total)} went back to Unassigned this month`, ...item.items.map((row) => `${bucketName(row.bucketId)} to ${bucketName(row.coveredId)} ${money(row.amount)}`)].join(" · "),
          open: toBuckets,
        }];
      case "pool_short": {
        const parts = [
          ...item.pause.map((row) => `Pause ${bucketName(row.bucketId)} (${money(row.monthly)} a month)`),
          ...item.recede.map((row) => `${bucketName(row.bucketId)} gives ${money(row.amount)}`),
          ...(item.uncovered > 0 ? [`${money(item.uncovered)} not covered`] : []),
        ];
        return [{
          key: item.code,
          hue: "attention",
          icon: CircleAlert,
          title: `Pool runs short on ${formatDate(item.date)} by ${money(item.short)}`,
          detail: parts.length > 0 ? parts.join(" · ") : null,
          open: toBuckets,
        }];
      }
      case "savings_rate":
        return [{
          key: item.code,
          hue: "mint",
          icon: PiggyBank,
          title: "Savings rate below 0%",
          detail: `${rateText(item.savingsRateMilliPct)} over the last 3 complete months`,
          open: () => void go({ to: "/", search: { window: "3" } }),
        }];
    }
  });
}

/** Home "Needs you": only the items that need the user. Each row opens the screen of its fix. With no item, it does not show. */
export function NeedsYouCard() {
  const { data } = useSuspenseQuery(needsYouQuery(localAsOf()));
  const rows = useRows(data.items);
  if (rows.length === 0) {
    return null;
  }
  return (
    <ListCard label="Needs you" title="Needs you" actions={<Badge variant="count">{rows.length}</Badge>}>
      {rows.map((row) => {
        const Icon = row.icon;
        return (
          <ListRow key={row.key} label={row.title} onOpen={row.open}>
            <IconTile hue={row.hue}>
              <Icon strokeWidth={1.8} />
            </IconTile>
            <span className={listName}>
              {row.title}
              {row.detail ? <small>{row.detail}</small> : null}
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.8} aria-hidden="true" />
          </ListRow>
        );
      })}
    </ListCard>
  );
}
