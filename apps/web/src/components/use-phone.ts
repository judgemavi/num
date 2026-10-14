import { useSyncExternalStore } from "react";

const phoneQuery = "(max-width: 767px)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(phoneQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** True when the window has the width of a phone. */
export function usePhone() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(phoneQuery).matches);
}
