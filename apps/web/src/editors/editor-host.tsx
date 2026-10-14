import { useParams, useRouter, useRouterState, useSearch } from "@tanstack/react-router";
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
import { EditorContext, EditorFrameContext } from "@/editors/editor-api";
import { EditorBody } from "@/editors/editor-registry";
import { createEditorStore } from "@/editors/editor-store";
import type { EditorFrame, EditorInput, EditorKind } from "@/editors/editor-types";

/** The name of the reconcile editor of an account in the URL state of the host. The `edit` value never has this text. */
function reconcileKey(accountId: string) {
  return `reconcile:${accountId}`;
}

/**
 * The editor that the URL shows. `edit` shows the editor of one record. `reconcile` on the page of an account shows
 * the reconcile editor of that account. Group mode and the other editors are not in the URL.
 */
function editorOfUrl(search: { edit?: string; reconcile?: boolean }, accountId: string | undefined) {
  const edit = parseEditParam(search.edit);
  if (edit) {
    return { key: formatEditParam(edit.kind, edit.id), frame: frameOf<RecordEditorKind>(edit.kind, { id: edit.id }) };
  }
  if (search.reconcile && accountId) {
    return { key: reconcileKey(accountId), frame: frameOf("reconcile", { accountId }) };
  }
  return null;
}

/** The key of an editor in the URL. Null when the URL does not show this editor. `pageAccountId` is the account of the page. */
function urlKeyOf(frame: EditorFrame, pageAccountId: string | undefined) {
  if (frame.kind === "reconcile") {
    return frame.input.accountId === pageAccountId ? reconcileKey(pageAccountId) : null;
  }
  if (!isRecordEditorKind(frame.kind) || !("id" in frame.input)) {
    return null;
  }
  if ("groupIds" in frame.input && (frame.input.groupIds?.length ?? 0) > 0) {
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

  /** Show one editor in the URL, or no editor. */
  function writeUrl(shown: { frame: EditorFrame; key: string } | null, replace: boolean) {
    // A value that is `undefined` is not in the URL.
    const reconcile = shown?.frame.kind === "reconcile";
    const search = { edit: shown && !reconcile ? shown.key : undefined, reconcile: reconcile ? true : undefined };
    void router.navigate({ to: ".", replace, search: (prev) => ({ ...prev, ...search }) });
  }

  /** Close an editor and remove it from the URL. */
  function close(key: number, result: string | null) {
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
    followUrl(wanted: ReturnType<typeof editorOfUrl>, pathname: string) {
      const pathnameChanged = lastPath !== pathname;
      lastPath = pathname;
      const open = store.snapshot().editor;
      if (open && open.editValue === null && !pathnameChanged) {
        return;
      }
      if (open && open.editValue !== null && open.editValue === wanted?.key) {
        return;
      }
      if (open) {
        store.close(open.key, null);
      }
      if (wanted) {
        void store.open(wanted.frame, { editValue: wanted.key, pushed: false });
      }
    },
    api: {
      openEditor<K extends EditorKind>(kind: K, input: EditorInput[K]) {
        const open = store.snapshot().editor;
        const hadUrl = open !== null && open.editValue !== null;
        // The type argument makes the frame of one kind a member of the union of all frames.
        const frame = frameOf<EditorKind>(kind, input);
        const page = router.matchRoute({ to: "/accounts/$accountId" });
        const editValue = urlKeyOf(frame, page ? page.accountId : undefined);
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
  const reconcile = useSearch({ strict: false, select: (search) => search.reconcile });
  const accountId = useParams({ strict: false, select: (params) => params.accountId });
  const [host] = useState(() => createHost(router));
  const { editor, confirm } = useSyncExternalStore(host.store.subscribe, host.store.snapshot);

  // The router is the source of the URL. The store of the host is not a part of React. This effect makes them agree.
  useEffect(() => {
    host.followUrl(editorOfUrl({ edit, reconcile }, accountId), pathname);
  }, [host, pathname, edit, reconcile, accountId]);

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
          <DialogContent className={panelClass(editor.frame.kind)}>
            <EditorFrameContext key={editor.key} value={{ close: (result = null) => host.close(editor.key, result) }}>
              <EditorBody {...editor.frame} />
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
        <AlertDialogContent className="z-[70]">
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
