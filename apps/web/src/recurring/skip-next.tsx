import { useSuspenseQueries } from "@tanstack/react-query";
import { errorCode } from "@/api/client";
import { occurrencesQuery, planQuery, useSkipOccurrence } from "@/api/recurring";
import { localAsOf } from "@/as-of";
import { planError } from "@/recurring/format";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEditorFrame } from "@/editors/editor-api";
import type { EditorInput } from "@/editors/editor-types";
import { DialogBody } from "@/editors/form-chrome";
import { useAppForm } from "@/forms/form-hook";

export function SkipNext({ planId }: EditorInput["skipNext"]) {
  const { close } = useEditorFrame();
  const [{ data: plan }, { data: occurrences }] = useSuspenseQueries({ queries: [planQuery(planId), occurrencesQuery(planId, localAsOf())] });
  const skip = useSkipOccurrence();
  const next = occurrences.items.find((item) => item.status === "missed" || item.status === "open");
  const form = useAppForm({
    defaultValues: { reason: "" },
    validators: {
      onSubmit: () => (next ? undefined : "There is no occurrence to skip."),
    },
    onSubmit: async ({ value, formApi }) => {
      if (!next) {
        return;
      }
      try {
        await skip.mutateAsync({ planId, dueDate: next.dueDate, reason: value.reason.trim() });
        close("ok");
      } catch (error) {
        formApi.setErrorMap({ onSubmit: { form: planError(errorCode(error)), fields: {} } });
      }
    },
  });

  return (
    <form.AppForm>
      <form.FormShell>
        <DialogHeader>
          <DialogTitle>Skip next</DialogTitle>
          <DialogDescription>Skip the next open or missed occurrence of {plan.name}.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form.AppField name="reason">{(field) => <field.TextField id="skip-next-reason" label="Reason" />}</form.AppField>
          <form.FormError />
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <form.Subscribe selector={(state) => state.values.reason.trim().length === 0}>
            {(blank) => <form.SubmitButton disabled={blank}>Skip</form.SubmitButton>}
          </form.Subscribe>
        </DialogFooter>
      </form.FormShell>
    </form.AppForm>
  );
}
