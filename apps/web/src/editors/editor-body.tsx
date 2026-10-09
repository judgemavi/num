import { AssignEditor, FundEditor, ImportEditor, MoveEditor, ReconcileEditor } from "@/editors/action-editors";
import type { EditorInput, EditorKind } from "@/editors/editor-types";
import {
  ImportInfoEditor,
  LinkOccurrenceEditor,
  MergeEditor,
  SkipNextEditor,
  SkipOccurrenceEditor,
} from "@/editors/more-editors";
import {
  AccountRecord,
  BucketRecord,
  CategoryRecord,
  GroupRecord,
  MerchantRecord,
  MortgageRecord,
  PlanRecord,
  TagRecord,
  TransactionRecord,
} from "@/editors/record-editors";

type BodyProps = {
  kind: EditorKind;
  props: EditorInput[EditorKind];
  onClose: () => void;
  onSaved: (id: string) => void;
};

export function EditorBody({ kind, props, onClose, onSaved }: BodyProps) {
  switch (kind) {
    case "transaction":
      return <TransactionRecord props={props as EditorInput["transaction"]} onClose={onClose} onSaved={onSaved} />;
    case "account":
      return <AccountRecord props={props as EditorInput["account"]} onClose={onClose} onSaved={onSaved} />;
    case "category":
      return <CategoryRecord props={props as EditorInput["category"]} onClose={onClose} onSaved={onSaved} />;
    case "group":
      return <GroupRecord props={props as EditorInput["group"]} onClose={onClose} onSaved={onSaved} />;
    case "tag":
      return <TagRecord props={props as EditorInput["tag"]} onClose={onClose} onSaved={onSaved} />;
    case "merchant":
      return <MerchantRecord props={props as EditorInput["merchant"]} onClose={onClose} onSaved={onSaved} />;
    case "bucket":
      return <BucketRecord props={props as EditorInput["bucket"]} onClose={onClose} onSaved={onSaved} />;
    case "plan":
      return <PlanRecord props={props as EditorInput["plan"]} onClose={onClose} onSaved={onSaved} />;
    case "mortgage":
      return <MortgageRecord props={props as EditorInput["mortgage"]} onClose={onClose} onSaved={onSaved} />;
    case "import":
      return <ImportEditor props={props as EditorInput["import"]} onClose={onClose} onSaved={onSaved} />;
    case "reconcile":
      return <ReconcileEditor props={props as EditorInput["reconcile"]} onClose={onClose} />;
    case "fundPaycheck":
      return <FundEditor props={props as EditorInput["fundPaycheck"]} onClose={onClose} onSaved={onSaved} />;
    case "assignMoney":
      return <AssignEditor props={props as EditorInput["assignMoney"]} onClose={onClose} onSaved={onSaved} />;
    case "moveMoney":
      return <MoveEditor props={props as EditorInput["moveMoney"]} onClose={onClose} onSaved={onSaved} />;
    case "importInfo":
      return <ImportInfoEditor props={props as EditorInput["importInfo"]} onClose={onClose} />;
    case "mergeMerchant":
      return <MergeEditor props={props as EditorInput["mergeMerchant"]} onClose={onClose} onSaved={onSaved} />;
    case "skipNext":
      return <SkipNextEditor props={props as EditorInput["skipNext"]} onClose={onClose} onSaved={onSaved} />;
    case "skipOccurrence":
      return <SkipOccurrenceEditor props={props as EditorInput["skipOccurrence"]} onClose={onClose} onSaved={onSaved} />;
    case "linkOccurrence":
      return <LinkOccurrenceEditor props={props as EditorInput["linkOccurrence"]} onClose={onClose} onSaved={onSaved} />;
  }
}
