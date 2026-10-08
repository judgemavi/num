export type EditorFrame = {
  key: number;
  kind: string;
  props: unknown;
};

type Waiter = (result: string | null) => void;

export type EditorStack = {
  frames: EditorFrame[];
  subscribe: (listener: () => void) => () => void;
  open: (kind: string, props: unknown) => { key: number; done: Promise<string | null> };
  complete: (key: number, result: string | null) => void;
};

export function createEditorStack(): EditorStack {
  let nextKey = 1;
  let frames: EditorFrame[] = [];
  const waiters = new Map<number, Waiter>();
  const listeners = new Set<() => void>();

  function emit() {
    for (const listener of listeners) {
      listener();
    }
  }

  return {
    get frames() {
      return frames;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    open(kind, props) {
      const key = nextKey;
      nextKey += 1;
      frames = [...frames, { key, kind, props }];
      const done = new Promise<string | null>((resolve) => {
        waiters.set(key, resolve);
      });
      emit();
      return { key, done };
    },
    complete(key, result) {
      const resolve = waiters.get(key);
      if (!resolve) {
        return;
      }
      waiters.delete(key);
      frames = frames.filter((frame) => frame.key !== key);
      resolve(result);
      emit();
    },
  };
}
