export const inlineCreateMaxDepth = 2;

export type InlineCreateResult = {
  expanded: false;
  selectedId: string | null;
};

/** A picker can open an inline form while it is above the second nesting level. */
export function canOfferInlineCreate(depth: number): boolean {
  return depth < inlineCreateMaxDepth;
}

/**
 * Save selects the new record and closes the form.
 * Cancel keeps the current selection and closes the form.
 */
export function finishInlineCreate(currentId: string | null, savedId: string | null): InlineCreateResult {
  return {
    expanded: false,
    selectedId: savedId === null ? currentId : savedId,
  };
}
