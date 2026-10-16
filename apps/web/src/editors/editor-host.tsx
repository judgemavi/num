import { useRouter, useRouterState, useSearch } from "@tanstack/react-router";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { formatEditParam, isRecordEditorKind, parseEditParam, type RecordEditorKind } from "@/editors/edit-url";
import { BulkEditorFrameContext, EditorContext, EditorFrameContext } from "@/editors/editor-api";
import { EditorBody } from "@/editors/editor-registry";
import { preloadEditor } from "@/editors/editor-chunks";
import { createEditorStore } from "@/editors/editor-store";
import type { EditorFrame, EditorInput, EditorKind } from "@/editors/editor-types";

/** The editor that the URL shows. `edit` shows the editor of one record. The bulk editor and the other editors are not in the URL. */
function editorOfUrl(search: { edit?: string }) {
  const edit = parseEditParam(search.edit);
  return edit ? { key: formatEditParam(edit.kind, edit.id), frame: frameOf<RecordEditorKind>(edit.kind, { id: edit.id }) } : null;
}

/** The key of an editor in the URL. Null when the URL does not show this editor. */
function urlKeyOf(frame: EditorFrame) {
  if (!isRecordEditorKind(frame.kind) || !("id" in frame.input)) {
    return null;
  }
  return formatEditParam(frame.kind, frame.input.id);
}

function frameOf<K extends EditorKind>(kind: K, input: EditorInput[K]): EditorFrame<K> {
  return { kind, input };
}

function panelClass(kind: EditorKind) {
  if (kind === "import") {
    return "max-h-[min(44rem,calc(100%-2rem))] w-[min(52rem,calc(100%-2rem))] max-w-[52rem]";
  }
  return undefined;
}

/** The open editor, the open confirmation, and the functions that keep the URL and the open editor the same. */
function createHost(router: ReturnType<typeof useRouter>) {
  const store = createEditorStore();
  let lastPath = router.state.location.pathname;
  let opening = 0;

  /** Show one editor in the URL, or no editor. */
  function writeUrl(shown: { frame: EditorFrame; key: string } | null, replace: boolean) {
    // A value that is `undefined` is not in the URL.
    void router.navigate({ to: ".", replace, search: (prev) => ({ ...prev, edit: shown?.key }) });
  }

  /** Close an editor and remove it from the URL. */
  function close(key: number, result: string | true | null) {
    const closed = store.close(key, result);
    if (!closed || closed.editValue === null) {
      return;
    }
    if (closed.pushed) {
      router.history.back();
    } else {
      writeUrl(null, true);
    }
  }

  return {
    store,
    close,
    /** Make the open editor agree with the URL. The person used Back or Forward, or opened a link. */
    async followUrl(wanted: ReturnType<typeof editorOfUrl>, pathname: string) {
      const pathnameChanged = lastPath !== pathname;
      lastPath = pathname;
      const open = store.snapshot().editor;
      if (open && open.editValue === null && !pathnameChanged) {
        return;
      }
      if (open && open.editValue !== null && open.editValue === wanted?.key) {
        return;
      }
      const request = ++opening;
      if (open) {
        store.close(open.key, null);
      }
      if (wanted) {
        await preloadEditor(wanted.frame.kind).catch(() => undefined);
        if (request === opening) {
          void store.open(wanted.frame, { editValue: wanted.key, pushed: false });
        }
      }
    },
    api: {
      async openEditor<K extends EditorKind>(kind: K, input: EditorInput[K]) {
        const request = ++opening;
        await preloadEditor(kind).catch(() => undefined);
        if (request !== opening) return null;
        const open = store.snapshot().editor;
        const hadUrl = open !== null && open.editValue !== null;
        // The type argument makes the frame of one kind a member of the union of all frames.
        const frame = frameOf<EditorKind>(kind, input);
        const editValue = urlKeyOf(frame);
        const done = store.open(frame, { editValue, pushed: editValue !== null && !hadUrl });
        if (editValue) {
          writeUrl({ frame, key: editValue }, hadUrl);
        } else if (hadUrl) {
          writeUrl(null, true);
        }
        return done;
      },
      confirm: store.ask,
    },
  };
}

export function EditorHost({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const edit = useSearch({ strict: false, select: (search) => search.edit });
  const [host] = useState(() => createHost(router));
  const { editor, confirm } = useSyncExternalStore(host.store.subscribe, host.store.snapshot);

  // The router is the source of the URL. The store of the host is not a part of React. This effect makes them agree.
  useEffect(() => {
    void host.followUrl(editorOfUrl({ edit }), pathname);
  }, [host, pathname, edit]);

  const description = confirm?.description;

  return (
    <EditorContext value={host.api}>
      {children}
      {editor ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) {
              host.close(editor.key, null);
            }
          }}
        >
          {/* Most editors have no description. An editor that has one shows it under the title. */}
          <DialogContent aria-describedby={undefined} className={panelClass(editor.frame.kind)}>
            <EditorFrameContext key={editor.key} value={{ close: (result = null) => host.close(editor.key, result) }}>
              <BulkEditorFrameContext value={{ close: (result = null) => host.close(editor.key, result) }}>
                <EditorBody {...editor.frame} />
              </BulkEditorFrameContext>
            </EditorFrameContext>
          </DialogContent>
        </Dialog>
      ) : null}
      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) {
            host.store.answer(false);
          }
        }}
      >
        {/* A confirmation with no text description has no AlertDialogDescription. */}
        <AlertDialogContent className="z-[70]" {...(typeof description === "string" ? {} : { "aria-describedby": undefined })}>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            {typeof description === "string" ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
          </AlertDialogHeader>
          {description && typeof description !== "string" ? <div className="text-sm text-muted-foreground">{description}</div> : null}
          <AlertDialogFooter>
            {confirm?.hideCancel ? null : <AlertDialogCancel>{confirm?.cancelLabel ?? "Cancel"}</AlertDialogCancel>}
            <AlertDialogAction onClick={() => host.store.answer(true)}>{confirm?.confirmLabel ?? "Confirm"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </EditorContext>
  );
}
