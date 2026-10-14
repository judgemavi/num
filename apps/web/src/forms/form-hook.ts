import { createFormHook } from "@tanstack/react-form";
import { fieldContext, formContext } from "@/forms/form-context";
import {
  CheckboxField,
  ComboboxField,
  DateInputField,
  MoneyField,
  SelectField,
  SwitchField,
  TextareaField,
  TextField,
} from "@/forms/fields";
import { FormError, FormShell, SubmitButton } from "@/forms/form-parts";

/**
 * The form hook of the app (decision 0035). Each form calls `useAppForm(...)`. A field uses `form.AppField` and one of
 * the field components. A part of a form that is in its own component is made with `withForm`.
 * The form components (`FormShell`, `SubmitButton`, `FormError`) go inside `form.AppForm`.
 */
export const { useAppForm, withForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {
    TextField,
    MoneyField,
    TextareaField,
    DateInputField,
    SelectField,
    ComboboxField,
    SwitchField,
    CheckboxField,
  },
  formComponents: {
    FormShell,
    SubmitButton,
    FormError,
  },
});
