/**
 * Click the way a pointer does, not the way `el.click()` does.
 *
 * `el.click()` dispatches one `click` event. Real interfaces listen for far
 * more than that: a dropdown opens on `pointerdown`, a custom button
 * highlights on `pointerover`, a menu item commits on `mouseup`. Anything
 * built on a component library — which is most of what a support agent is
 * ever asked to help with — simply does not respond to a bare click.
 *
 * So: the full sequence a mouse produces, at the control's own centre,
 * with focus moved first like a real press does.
 */
export function firePointerSequence(el: HTMLElement): void {
  const rect = el.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;
  // No `view`: nothing listens for it, and handing an event a Window from
  // a different realm than the one constructing it is rejected outright —
  // the exact shape of an element inside a same-origin frame.
  const base = {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX,
    clientY,
  };

  const pointer = (type: string) =>
    el.dispatchEvent(
      new PointerEvent(type, {
        ...base,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
      }),
    );
  const mouse = (type: string, detail = 0) =>
    el.dispatchEvent(
      new MouseEvent(type, { ...base, detail, button: 0, buttons: 1 }),
    );

  pointer('pointerover');
  pointer('pointerenter');
  mouse('mouseover');
  mouse('mousemove');
  pointer('pointerdown');
  mouse('mousedown', 1);
  // Focus before the release, like a real press: a control that commits on
  // blur of the previous field needs that to have happened already.
  el.focus?.();
  pointer('pointerup');
  mouse('mouseup', 1);
  mouse('click', 1);
}
