/**
 * Write a value the way a person would, so the framework notices.
 *
 * `el.value = x` sets the DOM property and nothing else. React tracks the
 * last value it wrote on the node itself and compares against it, so a
 * direct assignment followed by an `input` event looks to React like "the
 * value is already what I think it is" and the change is swallowed — the
 * field shows the new text and the app's state still holds the old one.
 * Vue's v-model has the same shape of problem through its own listener.
 *
 * Going through the PROTOTYPE's setter is what a real keystroke does, and
 * it is what makes the tracker see a change. Then the events: `input` for
 * what is being typed, `change` for what was committed.
 */
export function setNativeValue(el: HTMLElement, value: string): boolean {
  const prototype =
    el instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : el instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : null;
  if (!prototype) return false;

  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (!setter) return false;
  setter.call(el, value);

  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}
