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
  /** Close a record form with its saved id, or no result when it is cancelled. */
  close: (result?: string | null) => void;
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

/** Only the dialog host supplies a frame for a write of several records. */
export const BulkEditorFrameContext = createContext<{ close: (result?: true | null) => void } | null>(null);

export function useBulkEditorFrame() {
  const value = useContext(BulkEditorFrameContext);
  if (!value) {
    throw new Error("The bulk editor is not in a dialog frame.");
  }
  return value;
}
