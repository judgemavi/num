import { useStore } from "@tanstack/react-form";
import type { KeyboardEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { dialogFrameClass } from "@/editors/form-chrome";
import { useFormContext } from "@/forms/form-context";

/**
 * The element around the fields of a form. In a dialog it is a `<form>`. Inline create sits inside another form, and a
 * nested form submits the parent in React 19, thus inline it is a `<div>` that submits on Enter.
 */
export function FormShell({ inline = false, className, children }: { inline?: boolean; className?: string; children: ReactNode }) {
  const form = useFormContext();
  if (!inline) {
    return (
      <form
        className={className ?? dialogFrameClass}
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        {children}
      </form>
    );
  }
  return (
    <div
      className={className}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "Enter" || event.nativeEvent.isComposing) {
          return;
        }
        const target = event.target;
        if (!(target instanceof HTMLElement) || target.tagName === "TEXTAREA" || target.tagName === "BUTTON") {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      {children}
    </div>
  );
}

/**
 * The save button of a form. It is disabled while the form submits. A failed save keeps the button on, thus the
 * person can try again. `saving` is the text while the form submits.
 */
export function SubmitButton({
  inline = false,
  disabled = false,
  saving,
  children,
}: {
  inline?: boolean;
  disabled?: boolean;
  saving?: ReactNode;
  children: ReactNode;
}) {
  const form = useFormContext();
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <Button
          type={inline ? "button" : "submit"}
          disabled={disabled || isSubmitting}
          onClick={inline ? () => void form.handleSubmit() : undefined}
        >
          {isSubmitting && saving ? saving : children}
        </Button>
      )}
    </form.Subscribe>
  );
}

/**
 * The first error of the form, under the fields. A validator gives the text of the error. A Standard Schema validator
 * gives issues, and then the form shows `invalid`.
 */
export function FormError({ invalid = "Check the fields." }: { invalid?: string }) {
  const form = useFormContext();
  const error = useStore(form.store, (state) => state.errors.find((item) => item !== undefined && item !== null && item !== ""));
  if (error === undefined) {
    return null;
  }
  return <FieldError>{typeof error === "string" ? error : invalid}</FieldError>;
}
