import { createElement, use, type ComponentType } from "react";


/** Retry a chunk once. An old build can recover from a missing chunk with one page reload. */
export function retryLazy<Props extends object>(importModule: () => Promise<{ default: ComponentType<Props> }>) {
  let loaded: Awaited<ReturnType<typeof importModule>> | undefined;
  let pending: ReturnType<typeof importModule> | undefined;
  function load() {
    pending ??= importModule().catch(() => importModule()).then((module) => {
      loaded = module;
      return module;
    }).catch((error: unknown) => {
      const missing = error instanceof Error && /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError/i.test(error.message);
      if (missing) {
        const reloadKey = `num:chunk-reload:${error.message}`;
        try {
          if (sessionStorage.getItem(reloadKey) === null) {
            sessionStorage.setItem(reloadKey, "1");
            window.location.reload();
          }
        } catch {
          // Storage can be unavailable. The boundary still offers a retry.
        }
      }
      throw error;
    });
    return pending;
  }
  return {
    Component: (props: Props) => {
      const module = loaded ?? use(load());
      return createElement(module.default, props);
    },
    preload: load,
    retry: () => {
      if (!loaded) pending = undefined;
    },
  };
}
