/** Resolve the same unambiguous, enabled option for consent and execution. */
export function resolveSelectOption(
  element: HTMLElement,
  value: string | undefined,
): HTMLOptionElement | null {
  if (!(element instanceof HTMLSelectElement) || value === undefined)
    return null;
  const options = Array.from(element.options);
  // A value and a visible label must not identify two different options.
  const matches = options.filter(
    (option) =>
      option.value === value ||
      option.label.trim().toLowerCase() === value.trim().toLowerCase(),
  );
  const [option] = matches;
  if (
    matches.length !== 1 ||
    !option ||
    option.disabled ||
    (option.parentElement instanceof HTMLOptGroupElement &&
      option.parentElement.disabled) ||
    // Native value assignment cannot distinguish options sharing a value.
    options.filter((candidate) => candidate.value === option.value).length !== 1
  )
    return null;
  return option;
}
