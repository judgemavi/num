import { DialogBody, FormActions, FormCancel, FormHeading } from "@/editors/form-chrome";
import { withForm } from "@/forms/form-hook";

/**
 * The fields of a form that has only a name: a tag or a merchant. The owner of the form gives the validators
 * and the write. `children` shows above the name.
 */
export const NameFields = withForm({
  defaultValues: { name: "" },
  props: {
    title: "",
    /** The text of the save button, and its text while the form saves. */
    submitLabel: "",
    saving: "",
    inline: false,
    idPrefix: "record-name",
  },
  render: function NameFieldsRender({ form, title, submitLabel, saving, inline, idPrefix, children }) {
    return (
      <form.AppForm>
        <FormHeading inline={inline} title={title} />
        <form.FormShell inline={inline} className={inline ? "flex flex-col gap-4" : undefined}>
          <DialogBody className={inline ? "contents flex-none overflow-visible p-0" : undefined}>
            {children}
            <form.AppField name="name">{(field) => <field.TextField id={idPrefix} label="Name" autoComplete="off" />}</form.AppField>
            <form.FormError invalid="Enter a name." />
          </DialogBody>
          <FormActions inline={inline}>
            <FormCancel>Cancel</FormCancel>
            <form.SubmitButton inline={inline} saving={saving}>
              {submitLabel}
            </form.SubmitButton>
          </FormActions>
        </form.FormShell>
      </form.AppForm>
    );
  },
});
