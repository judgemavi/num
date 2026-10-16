import type { ConfirmOptions } from "@/editors/editor-api";
import type { EditorFrame } from "@/editors/editor-types";

type OpenEditor = {
  key: number;
  frame: EditorFrame;
  /** The `edit` value of the URL for this editor. Null when the URL does not show this editor. */
  editValue: string | null;
  /** True when this editor added a history entry. */
  pushed: boolean;
  done: Promise<string | true | null>;
  resolve: (result: string | true | null) => void;
};

type ConfirmRequest = ConfirmOptions & { resolve: (value: boolean) => void };

type EditorState = { editor: OpenEditor | null; confirm: ConfirmRequest | null };

/** The state of the dialog host: the one open editor and the one open confirmation. Editors do not stack. */
export function createEditorStore() {
  let state: EditorState = { editor: null, confirm: null };
  let nextKey = 1;
  const listeners = new Set<() => void>();

  function set(next: EditorState) {
    state = next;
    for (const listener of listeners) {
      listener();
    }
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot: () => state,
    /** Open an editor. An editor that is open closes first, with no result. */
    open(frame: EditorFrame, url: Pick<OpenEditor, "editValue" | "pushed">) {
      state.editor?.resolve(null);
      let resolve: OpenEditor["resolve"] = () => {};
      const done = new Promise<string | true | null>((settle) => {
        resolve = settle;
      });
      const key = nextKey;
      nextKey += 1;
      set({ ...state, editor: { key, frame, ...url, done, resolve } });
      return done;
    },
    /** Close the editor with this key and give the result to the code that opened it. Other keys do nothing. */
    close(key: number, result: string | true | null) {
      const closed = state.editor;
      if (!closed || closed.key !== key) {
        return null;
      }
      set({ ...state, editor: null });
      closed.resolve(result);
      return closed;
    },
    /** Ask for a confirmation. A confirmation that is open gets the answer "no" first. */
    ask(options: ConfirmOptions) {
      state.confirm?.resolve(false);
      return new Promise<boolean>((resolve) => {
        set({ ...state, confirm: { ...options, resolve } });
      });
    },
    answer(value: boolean) {
      const asked = state.confirm;
      if (!asked) {
        return;
      }
      set({ ...state, confirm: null });
      asked.resolve(value);
    },
  };
}
