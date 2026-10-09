import type { Account, Merchant, Plan, RecurringSignals } from "@num/shared";
import { ListCard, ListRow, listName } from "@/components/list-card";
import { Amount } from "@/components/amount";
import { formatDate } from "@/recurring/format";

type ReviewListProps = {
  signals: RecurringSignals;
  plans: Plan[];
  accounts: Account[];
  merchants: Merchant[];
  currency: string;
  onOpenPlan: (plan: Plan) => void;
  onUseProposal: (proposal: RecurringSignals["proposals"][number], name: string) => void;
};

export function ReviewList({ signals, plans, accounts, merchants, currency, onOpenPlan, onUseProposal }: ReviewListProps) {
  const planName = new Map(plans.map((plan) => [plan.id, plan]));
  const accountName = new Map(accounts.map((account) => [account.id, account.name]));
  const merchantName = new Map(merchants.map((merchant) => [merchant.id, merchant.name]));
  const rows = signals.changed.length + signals.missed.length + signals.ambiguous.length + signals.proposals.length;
  if (rows === 0) {
    return null;
  }

  return (
    <ListCard label="To review" title="To review">
      {signals.missed.map((item) => (
        <ListRow key={`missed-${item.planId}-${item.dueDate}`} simple onOpen={() => {
          const plan = planName.get(item.planId);
          if (plan) {
            onOpenPlan(plan);
          }
        }}>
          <div className={listName}>
            {planName.get(item.planId)?.name ?? "Recurring"}
            <small>Missed {formatDate(item.dueDate)}</small>
          </div>
        </ListRow>
      ))}
      {signals.changed.map((item) => (
        <ListRow key={`changed-${item.planId}-${item.dueDate}`} simple onOpen={() => {
          const plan = planName.get(item.planId);
          if (plan) {
            onOpenPlan(plan);
          }
        }}>
          <div className={listName}>
            {planName.get(item.planId)?.name ?? "Recurring"}
            <small>Amount changed on {formatDate(item.dueDate)}</small>
          </div>
          <div className="text-right text-sm">
            <Amount currency={currency} minor={item.expectedAmount} />
            <span className="text-muted-foreground"> to </span>
            <Amount currency={currency} minor={item.actualAmount} />
          </div>
        </ListRow>
      ))}
      {signals.ambiguous.map((item) => (
        <ListRow key={`ambiguous-${item.planId}-${item.dueDate}`} simple>
          <div className={listName}>
            {planName.get(item.planId)?.name ?? "Recurring"}
            <small>
              {item.transactionIds.length} possible matches on {formatDate(item.dueDate)}
            </small>
          </div>
        </ListRow>
      ))}
      {signals.proposals.map((item) => {
        const name = merchantName.get(item.merchantId) ?? "Merchant";
        return (
          <ListRow key={`proposal-${item.accountId}-${item.merchantId}-${item.startDate}`} simple onOpen={() => onUseProposal(item, name)}>
            <div className={listName}>
              {name}
              <small>
                Possible plan on {accountName.get(item.accountId) ?? "an account"}, from {formatDate(item.startDate)}
              </small>
            </div>
          </ListRow>
        );
      })}
    </ListCard>
  );
}
