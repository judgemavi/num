import { createFormHookContexts } from "@tanstack/react-form";

/**
 * The contexts of TanStack Form (decision 0035). A field component reads its field with `useFieldContext`. A form
 * component reads its form with `useFormContext`.
 */
export const { fieldContext, formContext, useFieldContext, useFormContext } = createFormHookContexts();
