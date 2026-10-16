import { useAppForm } from "@/forms/form-hook";

/** The form and actions for the archived filter. The caller reads its own route. */
export function useArchivedFilter(shown: boolean, apply: (change: { archived: boolean }) => void, switchId: string) {
  // The panel keeps the change of the person until the person applies it.
  const panel = useAppForm({
    defaultValues: { archived: shown },
    onSubmit: ({ value }) => apply(value),
  });

  return {
    activeCount: shown ? 1 : 0,
    badges: shown ? [{ key: "archived", label: "Archived", onRemove: () => apply({ archived: false }) }] : [],
    onOpenChange: (open: boolean) => {
      if (open) {
        panel.reset();
      }
    },
    onApply: () => void panel.handleSubmit(),
    onClear: () => panel.reset({ archived: false }, { keepDefaultValues: true }),
    onClearAll: () => apply({ archived: false }),
    fields: (
      <panel.AppField name="archived">
        {(field) => <field.SwitchField id={switchId} label="Show archived" />}
      </panel.AppField>
    ),
  };
}
