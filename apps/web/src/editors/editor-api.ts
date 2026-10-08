import { createContext, useContext, type ReactNode } from "react";
import type { EditorInput, EditorKind } from "@/editors/editor-types";

export type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  hideCancel?: boolean;
};

export type HostApi = {
  openEditor: <K extends EditorKind>(kind: K, props: EditorInput[K]) => Promise<string | null>;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  dismissKind: (kind: EditorKind) => void;
};

export const EditorContext = createContext<HostApi | null>(null);

export function useEditors(): HostApi {
  const value = useContext(EditorContext);
  if (!value) {
    throw new Error("The editor host is missing.");
  }
  return value;
}
