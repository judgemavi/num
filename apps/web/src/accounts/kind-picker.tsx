import { accountKinds, type AccountKind } from "@num/shared";
import { ChoiceCard } from "@/components/choice-card";
import { Disclosure } from "@/components/disclosure";
import { Reveal } from "@/components/reveal";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import { RadioGroup } from "@/components/ui/radio-group";

const commonChoices = [
  { id: "chequing", title: "Everyday", description: "Money comes in and goes out" },
  { id: "savings", title: "Savings", description: "Money you put aside" },
  { id: "credit_card", title: "Credit card", description: "Spend now, pay the bill later" },
  { id: "borrow", title: "Loan or mortgage", description: "Money you borrowed and pay back" },
  { id: "investment", title: "Investment", description: "Funds, stocks or retirement" },
  { id: "property", title: "Something you own", description: "A home, a car, other property" },
] as const;

const moreChoices = [
  { id: "cash", title: "Cash", description: "Money you hold yourself" },
  { id: "receivable", title: "Money lent to someone", description: "Someone owes this to you" },
  { id: "other_asset", title: "Other asset", description: "Something else you own" },
  { id: "other_liability", title: "Other debt", description: "A debt that is not a loan" },
] as const;

type KindPickerProps = {
  kind: AccountKind;
  allowed: readonly AccountKind[];
  onChange: (kind: AccountKind) => void;
};

function allowedSet(allowed: readonly AccountKind[]) {
  return new Set(allowed);
}

function radioValue(kind: AccountKind): string {
  if (kind === "loan" || kind === "mortgage") {
    return "borrow";
  }
  return kind;
}

export function KindPicker({ kind, allowed, onChange }: KindPickerProps) {
  const allowedKinds = allowedSet(allowed);
  const canBorrow = allowedKinds.has("loan") || allowedKinds.has("mortgage");
  const askMortgage = allowedKinds.has("loan") && allowedKinds.has("mortgage");
  const common = commonChoices.filter((choice) => (choice.id === "borrow" ? canBorrow : allowedKinds.has(choice.id)));
  const more = moreChoices.filter((choice) => allowedKinds.has(choice.id));
  const moreSelected = more.some((choice) => choice.id === kind);

  function pick(value: string) {
    if (value === "borrow") {
      if (kind === "mortgage" || !allowedKinds.has("loan")) {
        onChange("mortgage");
        return;
      }
      onChange("loan");
      return;
    }
    if ((accountKinds as readonly string[]).includes(value)) {
      onChange(value as AccountKind);
    }
  }

  return (
    <FieldSet>
      <FieldLegend variant="label">What kind of account is it?</FieldLegend>
      <RadioGroup value={radioValue(kind)} onValueChange={pick}>
        <div className="kinds">
          {common.map((choice) => (
            <ChoiceCard key={choice.id} value={choice.id} title={choice.title} description={choice.description} />
          ))}
        </div>
        {more.length > 0 ? (
          <Disclosure label="More kinds" defaultOpen={moreSelected}>
            <div className="kinds">
              {more.map((choice) => (
                <ChoiceCard key={choice.id} value={choice.id} title={choice.title} description={choice.description} />
              ))}
            </div>
          </Disclosure>
        ) : null}
      </RadioGroup>
      {askMortgage && (kind === "loan" || kind === "mortgage") ? (
        <Reveal title="Is it a mortgage?">
          <RadioGroup
            value={kind === "mortgage" ? "yes" : "no"}
            onValueChange={(value) => onChange(value === "yes" ? "mortgage" : "loan")}
          >
            <div className="kinds">
              <ChoiceCard value="yes" title="Yes" description="This debt is a mortgage." />
              <ChoiceCard value="no" title="No" description="This debt is a loan." />
            </div>
          </RadioGroup>
        </Reveal>
      ) : null}
    </FieldSet>
  );
}
