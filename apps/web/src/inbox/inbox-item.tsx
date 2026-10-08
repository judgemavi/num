import type { Account, Bucket, Category, InboxItem, Merchant, Plan } from "@num/shared";
import { AlertTriangle, ArrowLeftRight, Banknote, FileWarning, Repeat, Tag, TrendingUp, type LucideIcon } from "lucide-react";
import { useState } from "react";
import {
  acceptPair,
  coverOverspent,
  createProposedPlan,
  fundFromUnassigned,
  linkOccurrence,
  promoteRule,
  resolveReview,
  updatePlanAmount,
} from "@/inbox/actions";
import { UncategorizedEditor } from "@/inbox/uncategorized-editor";
import { inboxHue, itemTitle, itemWhy } from "@/inbox/format";
import { IconTile } from "@/components/icon-tile";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/money";

type InboxItemRowProps = {
  item: InboxItem;
  currency: string;
  asOf: string;
  accounts: Map<string, string>;
  accountList: Account[];
  plans: Map<string, Plan>;
  merchants: Map<string, string>;
  merchantList: Merchant[];
  categories: Category[];
  buckets: Bucket[];
  onSkip: (planId: string, dueDate: string) => void;
  onDismiss: (itemKey: string) => void;
  onAddByHand: (item: Extract<InboxItem, { kind: "import_unreadable" }>) => void;
  onOpenTransaction: (transactionId: string) => void;
  onFundPaycheck: (incomeTransactionId: string) => void;
  unassigned: number;
  onRestore?: (itemKey: string) => void;
  dismissedReason?: string;
  onDone: () => void;
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
  promote_rule: Tag,
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
  accountList,
  plans,
  merchants,
  merchantList,
  categories,
  buckets,
  onSkip,
  onDismiss,
  onAddByHand,
  onOpenTransaction,
  onFundPaycheck,
  unassigned,
  onRestore,
  dismissedReason,
  onDone,
  onError,
}: InboxItemRowProps) {
  const [pending, setPending] = useState(false);
  const [choice, setChoice] = useState("");
  const names = {
    account: (id: string) => accounts.get(id) ?? "Account",
    plan: (id: string) => plans.get(id)?.name ?? "Plan",
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
  } else if (item.kind === "recurring_missed") {
    primary = { label: "Skip this time", disabled: false, run: () => onSkip(item.planId, item.dueDate) };
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
      label: "Create the plan",
      disabled: false,
      run: () => void run(() => createProposedPlan(item, names.merchant(item.merchantId))),
    };
  } else if (item.kind === "transfer_pair") {
    primary = {
      label: "Yes, a transfer",
      disabled: false,
      run: () => void run(() => acceptPair(asOf, item.left.id, item.right.id)),
    };
  } else if (item.kind === "promote_rule") {
    primary = {
      label: "Create the rule",
      disabled: false,
      run: () => void run(() => promoteRule(item.payee, item.merchantId, item.categoryId)),
    };
  } else if (item.kind === "import_unreadable") {
    primary = { label: "Add by hand", disabled: false, run: () => onAddByHand(item) };
  } else if (item.kind === "paycheck_funding") {
    primary = { label: "Fund buckets", disabled: false, run: () => onFundPaycheck(item.incomeTransactionId) };
  } else if (item.kind === "bucket_overspent") {
    const need = -item.balance;
    const fromUnassigned = Math.min(need, Math.max(0, unassigned));
    choices = [
      ...(fromUnassigned > 0
        ? [{ id: "unassigned", label: `Unassigned · ${formatMoney(currency, unassigned)}` }]
        : []),
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
          selected === "unassigned"
            ? fundFromUnassigned(item.bucketId, fromUnassigned, asOf)
            : coverOverspent(item.bucketId, selected, asOf),
        ),
    };
  }

  return (
    <article className="border-t px-5 py-4 first:border-t-0">
      <div className="flex flex-wrap items-start gap-3">
        {hue === "attention" ? (
          <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-attn-soft text-attn" aria-hidden="true">
            <Icon strokeWidth={1.8} />
          </span>
        ) : (
          <IconTile hue={hue}>
            <Icon strokeWidth={1.8} />
          </IconTile>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{itemTitle(item, names, currency)}</h3>
          <p className="text-sm text-muted-foreground">{itemWhy(item, names, currency)}</p>
          {dismissedReason ? <p className="text-sm text-muted-foreground">Reason: {dismissedReason}</p> : null}
        </div>
        <div className="flex flex-wrap justify-end gap-2 max-md:w-full">
          {dismissedReason && onRestore ? (
            <Button type="button" disabled={pending} onClick={() => onRestore(item.itemKey)}>
              Restore
            </Button>
          ) : null}
          {dismissedReason ? null : (
            <>
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
              <Button type="button" variant="ghost" disabled={pending} onClick={() => onDismiss(item.itemKey)}>
                Not now
              </Button>
            </>
          )}
        </div>
      </div>
      {!dismissedReason && item.kind === "uncategorized" ? (
        <UncategorizedEditor
          item={item}
          currency={currency}
          accounts={accountList}
          categories={categories}
          merchants={merchantList}
          onMore={() => onOpenTransaction(item.transactionId)}
          onDone={onDone}
          onError={onError}
        />
      ) : null}
      {!dismissedReason && choices.length > 0 ? (
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
