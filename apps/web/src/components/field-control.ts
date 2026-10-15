/**
 * The one look of a field control (`docs/design.md` §6 Field): a text input, a Select trigger, a Combobox trigger and
 * a date trigger. 44px high, 12px radius, `control` border, 16px text (a phone does not zoom in), a 3px iris focus
 * ring and no outline.
 */
export const fieldControl =
  "flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-card px-3.5 hover:bg-card text-left text-base font-normal whitespace-nowrap text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50";

/** The icon at the end of a trigger: a chevron or a calendar. */
export const fieldControlIcon = "pointer-events-none size-4 shrink-0 text-muted-foreground";
