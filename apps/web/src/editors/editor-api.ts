import { createContext, useContext, type ReactNode } from "react";
import type { EditorInput, EditorKind } from "@/editors/editor-types";

export type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  hideCancel?: boolean;
};

type HostApi = {
  openEditor: <K extends EditorKind>(kind: K, input: EditorInput[K]) => Promise<string | true | null>;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

export const EditorContext = createContext<HostApi | null>(null);

export function useEditors(): HostApi {
  const value = useContext(EditorContext);
  if (!value) {
    throw new Error("The editor host is missing.");
  }
  return value;
}

type FrameApi = {
  /** Close the form. The result goes to the code that opened it: the id of the saved record, true for a save of several records, or nothing. */
  close: (result?: string | true | null) => void;
};

/**
 * The place that shows a form. The dialog host gives one for the open editor. A picker gives one for the form that it
 * shows inline. Thus a form closes the same way in the two places.
 */
export const EditorFrameContext = createContext<FrameApi | null>(null);

export function useEditorFrame(): FrameApi {
  const value = useContext(EditorFrameContext);
  if (!value) {
    throw new Error("The form is not in an editor frame.");
  }
  return value;
}
