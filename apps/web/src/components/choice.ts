/**
 * The choice that a control gave, with the type of the choices. A control gives its value as text.
 * The result is `undefined` when the text is not one of the choices.
 */
export function choiceIn<Choice extends string>(choices: readonly Choice[], value: string) {
  return choices.find((choice) => choice === value);
}
