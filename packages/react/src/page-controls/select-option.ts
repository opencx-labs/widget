/** Resolve the same unambiguous, enabled option for consent and execution. */
export function resolveSelectOption(
  element: HTMLElement,
  value: string | undefined,
): HTMLOptionElement | null {
  if (!(element instanceof HTMLSelectElement) || value === undefined)
    return null;
  const options = Array.from(element.options);
  const values = options.filter((option) => option.value === value);
  const matches = values.length
    ? values
    : options.filter(
        (option) =>
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
