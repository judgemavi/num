import type { Bucket, Category, InboxDecisionCode, InboxItem, Plan } from "@num/shared";
import { AlertTriangle, ArrowLeftRight, Banknote, ChevronRight, FileWarning, Repeat, Tag, TrendingUp, type LucideIcon } from "lucide-react";
import { useState } from "react";
import {
  acceptPair,
  applyInboxGroup,
  coverOverspent,
  createProposedPlan,
  fundFromUnassigned,
  linkOccurrence,
  resolveReview,
  updatePlanAmount,
} from "@/inbox/actions";
import { inboxHue, itemTitle, itemWhy } from "@/inbox/format";
import { IconTile } from "@/components/icon-tile";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/money";

type InboxItemRowProps = {
  item: InboxItem;
  currency: string;
  asOf: string;
  accounts: Map<string, string>;
  plans: Map<string, Plan>;
  merchants: Map<string, string>;
  categories: Category[];
  buckets: Bucket[];
  onSkip: (planId: string, dueDate: string) => void;
  onLink: (planId: string, dueDate: string) => void;
  onDecide: (itemKey: string, decision: InboxDecisionCode) => Promise<{ ok: boolean; code?: string }>;
  onAddByHand: (item: Extract<InboxItem, { kind: "import_unreadable" }>) => void;
  onOpenTransaction: (transactionId: string) => void;
  onFundPaycheck: (incomeTransactionId: string) => void;
  unassigned: number;
  onDone: () => void;
  onNotice: (text: string) => void;
  onError: (code: string) => void;
};

const icons: Record<InboxItem["kind"], LucideIcon> = {
  import_review: ArrowLeftRight,
  uncategorized: Tag,
  recurring_changed: TrendingUp,
  recurring_missed: Repeat,
  recurring_ambiguous: Repeat,
  plan_proposal: Repeat,
  transfer_pair: ArrowLeftRight,
  bucket_overspent: AlertTriangle,
  import_unreadable: FileWarning,
  paycheck_funding: Banknote,
};

function Choice({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <Button type="button" variant={pressed ? "default" : "outline"} aria-pressed={pressed} onClick={onClick}>
      {children}
    </Button>
  );
}

export function InboxItemRow({
  item,
  currency,
  asOf,
  accounts,
  plans,
  merchants,
  categories,
  buckets,
  onSkip,
  onLink,
  onDecide,
  onAddByHand,
  onOpenTransaction,
  onFundPaycheck,
  unassigned,
  onDone,
  onNotice,
  onError,
}: InboxItemRowProps) {
  const [pending, setPending] = useState(false);
  const [choice, setChoice] = useState("");
  const names = {
    account: (id: string) => accounts.get(id) ?? "Account",
    plan: (id: string) => plans.get(id)?.name ?? "Recurring",
    merchant: (id: string) => merchants.get(id) ?? "Merchant",
    category: (id: string) => categories.find((category) => category.id === id)?.name ?? "Category",
    bucket: (id: string) => buckets.find((bucket) => bucket.id === id)?.name ?? "Bucket",
  };
  const Icon = icons[item.kind];
  const hue = inboxHue(item.kind);
  const sources =
    item.kind === "bucket_overspent"
      ? buckets.filter((bucket) => bucket.id !== item.bucketId && bucket.balance >= -item.balance && bucket.archivedAt === null)
      : [];

  async function run(action: () => Promise<{ ok: boolean; code?: string }>) {
    setPending(true);
    const result = await action();
    setPending(false);
    if (!result.ok) {
      onError(result.code ?? "internal_error");
      return;
    }
    onDone();
  }

  let primary: { label: string; disabled: boolean; run: () => void } | null = null;
  let extra: { label: string; run: () => void } | null = null;
  let no: { label: string; run: () => void } | null = null;
  let choices: { id: string; label: string }[] = [];

  if (item.kind === "import_review") {
    choices = item.candidates.map((candidate) => ({
      id: candidate.id,
      label: `${candidate.payeeRaw} · ${formatMoney(currency, candidate.amount)}`,
    }));
    const selected = choice || (choices[0]?.id ?? "");
    primary = {
      label: "Use this match",
      disabled: selected.length === 0,
      run: () => void run(() => resolveReview(item, selected)),
    };
    extra = { label: "Add as new", run: () => void run(() => resolveReview(item, null)) };
  } else if (item.kind === "recurring_changed") {
    const plan = plans.get(item.planId);
    primary = {
      label: `Update to ${formatMoney(currency, item.actualAmount)}`,
      disabled: !plan,
      run: () => {
        if (plan) {
          void run(() => updatePlanAmount(plan, item.actualAmount));
        }
      },
    };
    no = { label: "Keep the recurring amount", run: () => void run(() => onDecide(item.itemKey, "keep_plan_amount")) };
  } else if (item.kind === "recurring_missed") {
    primary = { label: "Link a transaction", disabled: false, run: () => onLink(item.planId, item.dueDate) };
    no = { label: "Skip", run: () => onSkip(item.planId, item.dueDate) };
  } else if (item.kind === "recurring_ambiguous") {
    choices = item.transactions.map((txn) => ({
      id: txn.id,
      label: `${txn.payeeRaw} · ${formatMoney(currency, txn.amount)}`,
    }));
    const selected = choice || (choices[0]?.id ?? "");
    primary = {
      label: "Link this payment",
      disabled: selected.length === 0,
      run: () => void run(() => linkOccurrence(item.planId, item.dueDate, selected)),
    };
  } else if (item.kind === "plan_proposal") {
    primary = {
      label: item.expectedAmount >= 0 ? "Add recurring income" : "Add a recurring payment",
      disabled: false,
      run: () => void run(() => createProposedPlan(item, names.merchant(item.merchantId))),
    };
    no = { label: "Not recurring", run: () => void run(() => onDecide(item.itemKey, "not_recurring")) };
  } else if (item.kind === "transfer_pair") {
    primary = {
      label: "Yes, a transfer",
      disabled: false,
      run: () => void run(() => acceptPair(asOf, item.left.id, item.right.id)),
    };
    no = { label: "Not a transfer", run: () => void run(() => onDecide(item.itemKey, "not_transfer")) };
  } else if (item.kind === "import_unreadable") {
    primary = { label: "Add by hand", disabled: false, run: () => onAddByHand(item) };
    no = { label: "Not a transaction", run: () => void run(() => onDecide(item.itemKey, "not_a_transaction")) };
  } else if (item.kind === "paycheck_funding") {
    primary = { label: "Fund buckets", disabled: false, run: () => onFundPaycheck(item.incomeTransactionId) };
    no = { label: "Keep it unassigned", run: () => void run(() => onDecide(item.itemKey, "keep_unassigned")) };
  } else if (item.kind === "bucket_overspent") {
    const need = -item.balance;
    const fromUnassigned = Math.min(need, Math.max(0, unassigned));
    choices = [
      ...(fromUnassigned > 0 ? [{ id: "unassigned", label: `Unassigned · ${formatMoney(currency, unassigned)}` }] : []),
      ...sources.map((bucket) => ({
        id: bucket.id,
        label: `${bucket.name} · ${formatMoney(currency, bucket.balance)} left`,
      })),
    ];
    const selected = choice || (choices[0]?.id ?? "");
    primary = {
      label: selected === "unassigned" ? "Cover from Unassigned" : selected ? `Cover from ${names.bucket(selected)}` : "Cover it",
      disabled: selected.length === 0,
      run: () =>
        void run(() =>
          selected === "unassigned" ? fundFromUnassigned(item.bucketId, fromUnassigned, asOf) : coverOverspent(item.bucketId, selected, asOf),
        ),
    };
  }

  const title = itemTitle(item, names, currency);
  const why = itemWhy(item, names, currency);
  function rowBody(heading: boolean) {
    return (
      <>
        {hue === "attention" ? (
          <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-attn-soft text-attn" aria-hidden="true">
            <Icon strokeWidth={1.8} />
          </span>
        ) : (
          <IconTile hue={hue}>
            <Icon strokeWidth={1.8} />
          </IconTile>
        )}
        <div className="min-w-0 flex-1 text-left">
          {heading ? <h3 className="font-semibold">{title}</h3> : <span className="block font-semibold">{title}</span>}
          {heading ? (
            <p className="text-sm text-muted-foreground">{why}</p>
          ) : (
            <span className="block text-sm text-muted-foreground">{why}</span>
          )}
        </div>
      </>
    );
  }

  return (
    <article className="border-t px-5 py-4 first:border-t-0">
      <div className="flex flex-wrap items-start gap-3">
        {item.kind === "uncategorized" ? (
          <button type="button" className="flex min-w-0 flex-1 items-start gap-3" onClick={() => onOpenTransaction(item.transactionId)}>
            {rowBody(false)}
            <ChevronRight className="mt-1 size-5 shrink-0" aria-hidden="true" />
          </button>
        ) : (
          rowBody(true)
        )}
        <div className="flex flex-wrap justify-end gap-2 max-md:w-full">
          {extra ? (
            <Button type="button" variant="outline" disabled={pending} onClick={extra.run}>
              {extra.label}
            </Button>
          ) : null}
          {primary ? (
            <Button type="button" disabled={pending || primary.disabled} onClick={primary.run}>
              {primary.label}
            </Button>
          ) : null}
          {no ? (
            <Button type="button" variant="ghost" disabled={pending} onClick={no.run}>
              {no.label}
            </Button>
          ) : null}
        </div>
      </div>
      {item.kind === "uncategorized" ? (
        <div className="mt-3 flex flex-wrap gap-2 pl-13">
          {[item.suggestion, item.next]
            .filter((suggestion) => suggestion && (suggestion.categoryId || suggestion.transferAccountId))
            .map((suggestion, index) => {
              if (!suggestion) {
                return null;
              }
              const sure = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 0 }).format(
                suggestion.confidence / 1000,
              );
              const name = suggestion.transferAccountId
                ? `Transfer · ${names.account(suggestion.transferAccountId)}`
                : names.category(suggestion.categoryId ?? "");
              const label = `${name} · ${sure}`;
              return (
                <Button
                  key={`${suggestion.categoryId ?? ""}-${suggestion.transferAccountId ?? ""}-${index}`}
                  type="button"
                  variant={index === 0 ? "default" : "outline"}
                  disabled={pending}
                  onClick={() =>
                    void run(async () => {
                      const result = await applyInboxGroup(item.accountId, [item.transactionId], suggestion);
                      if (result.ok && result.data.skipped.length > 0) {
                        onNotice(`Applied to ${result.data.applied} · skipped ${result.data.skipped.length}`);
                      }
                      return result;
                    })
                  }
                >
                  {label}
                </Button>
              );
            })}
        </div>
      ) : null}
      {choices.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2 pl-13">
          {choices.map((option) => (
            <Choice key={option.id} pressed={(choice || choices[0]?.id) === option.id} onClick={() => setChoice(option.id)}>
              {option.label}
            </Choice>
          ))}
        </div>
      ) : null}
    </article>
  );
}
