import { useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
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
import { EditorBody } from "@/editors/editor-body";
import { formatEditParam, parseEditParam, type EditTarget } from "@/editors/edit-url";
import { createEditorStack, type EditorFrame } from "@/editors/editor-stack";
import { isRecordKind, type EditorInput, type EditorKind } from "@/editors/editor-types";
import { EditorContext, type ConfirmOptions, type HostApi } from "@/editors/editor-api";

export type { ConfirmOptions };

type FrameMeta = {
  trackUrl: boolean;
  pushed: boolean;
  editValue: string | null;
};

type ConfirmState = ConfirmOptions & { resolve: (value: boolean) => void };

const stack = createEditorStack();
const meta = new Map<number, FrameMeta>();
const pending = new Map<number, Promise<string | null>>();
function editValueOf(kind: EditorKind, props: EditorInput[EditorKind]): string | null {
  if (!isRecordKind(kind) || !("id" in props)) {
    return null;
  }
  return formatEditParam(kind, props.id);
}

function panelClass(kind: string): string | undefined {
  if (kind === "import") {
    return "max-h-[min(44rem,calc(100%-2rem))] w-[min(52rem,calc(100%-2rem))] max-w-[52rem]";
  }
  return undefined;
}

function FrameSlot({
  active,
  className,
  onDismiss,
  children,
}: {
  active: boolean;
  className?: string;
  onDismiss: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog open={active} onOpenChange={(open) => { if (!open) onDismiss(); }}>
      <DialogContent forceMount className={active ? className : "invisible pointer-events-none"}>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function EditorHost({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const frames = useSyncExternalStore(stack.subscribe, () => stack.frames, () => stack.frames);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const suppress = useRef(0);
  const pathRef = useRef<string | null>(null);
  const confirmRef = useRef<ConfirmState | null>(null);
  const apiRef = useRef<HostApi | null>(null);
  const reconcileRef = useRef<(edit: EditTarget | null, pathnameChanged: boolean) => void>(() => {});
  const stableApi = useState<HostApi>(() => ({
    openEditor: (kind, props) => apiRef.current?.openEditor(kind, props) ?? Promise.resolve(null),
    confirm: (options) => apiRef.current?.confirm(options) ?? Promise.resolve(false),
    dismissKind: (kind) => apiRef.current?.dismissKind(kind),
  }))[0];

  function writeEdit(edit: string | undefined, replace: boolean) {
    suppress.current += 1;
    void router.navigate({
      replace,
      search: ((prev: Record<string, unknown>) => {
        const next = { ...prev };
        if (edit) {
          next.edit = edit;
        } else {
          delete next.edit;
        }
        return next;
      }) as never,
    });
  }

  function closeFrame(key: number, result: string | null) {
    meta.delete(key);
    pending.delete(key);
    stack.complete(key, result);
  }

  function openFromHistory(target: EditTarget) {
    const props = { id: target.id } as EditorInput[typeof target.kind];
    const opened = stack.open(target.kind, props);
    pending.set(opened.key, opened.done);
    meta.set(opened.key, { trackUrl: true, pushed: false, editValue: formatEditParam(target.kind, target.id) });
  }

  function reconcile(edit: EditTarget | null, pathnameChanged: boolean) {
    if (pathnameChanged) {
      while (stack.frames.length > 0) {
        const top = stack.frames[stack.frames.length - 1];
        if (!top || meta.get(top.key)?.trackUrl) {
          break;
        }
        closeFrame(top.key, null);
      }
    }
    const wanted = edit ? formatEditParam(edit.kind, edit.id) : null;
    while (stack.frames.length > 0) {
      const top = stack.frames[stack.frames.length - 1];
      if (!top) {
        break;
      }
      const info = meta.get(top.key);
      if (!info?.trackUrl) {
        return;
      }
      if (info.editValue === wanted) {
        return;
      }
      closeFrame(top.key, null);
    }
    if (edit && wanted && !stack.frames.some((frame) => meta.get(frame.key)?.editValue === wanted)) {
      openFromHistory(edit);
    }
  }

  function closeUser(key: number, result: string | null) {
    const info = meta.get(key);
    closeFrame(key, result);
    if (!info?.trackUrl) {
      return;
    }
    if (info.pushed) {
      suppress.current += 1;
      router.history.back();
      return;
    }
    const parent = [...stack.frames].reverse().find((frame) => meta.get(frame.key)?.trackUrl);
    writeEdit(parent ? (meta.get(parent.key)?.editValue ?? undefined) : undefined, true);
  }

  const api: HostApi = {
    openEditor(kind, props) {
      if (kind === "reconcile") {
        const existing = stack.frames.find((frame) => frame.kind === "reconcile");
        const again = existing ? pending.get(existing.key) : undefined;
        if (again) {
          return again;
        }
      }
      const editValue = editValueOf(kind, props);
      const opened = stack.open(kind, props);
      pending.set(opened.key, opened.done);
      meta.set(opened.key, { trackUrl: editValue !== null, pushed: editValue !== null, editValue });
      if (editValue) {
        writeEdit(editValue, false);
      }
      return opened.done;
    },
    confirm(options) {
      confirmRef.current?.resolve(false);
      return new Promise((resolve) => {
        setConfirmState({ ...options, resolve });
      });
    },
    dismissKind(kind) {
      for (const frame of [...stack.frames]) {
        if (frame.kind === kind) {
          closeUser(frame.key, null);
        }
      }
    },
  };

  useEffect(() => {
    apiRef.current = api;
    confirmRef.current = confirmState;
    reconcileRef.current = reconcile;
  });

  useEffect(() => {
    const pathnameChanged = pathRef.current !== null && pathRef.current !== pathname;
    pathRef.current = pathname;
    if (suppress.current > 0) {
      suppress.current -= 1;
      return;
    }
    reconcileRef.current(parseEditParam(new URLSearchParams(searchStr).get("edit")), pathnameChanged);
  }, [pathname, searchStr]);

  const description = confirmState?.description;

  return (
    <EditorContext.Provider value={stableApi}>
      {children}
      {frames.map((frame, index) => (
        <HostedFrame
          key={frame.key}
          frame={frame}
          active={index === frames.length - 1}
          onFinish={(result) => closeUser(frame.key, result)}
        />
      ))}
      <AlertDialog
        open={confirmState !== null}
        onOpenChange={(open) => {
          if (!open) {
            confirmState?.resolve(false);
            setConfirmState(null);
          }
        }}
      >
        <AlertDialogContent className="z-[70]">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmState?.title}</AlertDialogTitle>
            {typeof description === "string" ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
          </AlertDialogHeader>
          {description && typeof description !== "string" ? <div className="text-sm text-muted-foreground">{description}</div> : null}
          <AlertDialogFooter>
            {confirmState?.hideCancel ? null : <AlertDialogCancel>{confirmState?.cancelLabel ?? "Cancel"}</AlertDialogCancel>}
            <AlertDialogAction
              onClick={() => {
                confirmState?.resolve(true);
                setConfirmState(null);
              }}
            >
              {confirmState?.confirmLabel ?? "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </EditorContext.Provider>
  );
}

function HostedFrame({ frame, active, onFinish }: { frame: EditorFrame; active: boolean; onFinish: (result: string | null) => void }) {
  const kind = frame.kind as EditorKind;
  const props = frame.props as EditorInput[EditorKind];
  return (
    <FrameSlot active={active} className={panelClass(frame.kind)} onDismiss={() => onFinish(null)}>
      <EditorBody kind={kind} props={props} onClose={() => onFinish(null)} onSaved={(id) => onFinish(id)} />
    </FrameSlot>
  );
}
