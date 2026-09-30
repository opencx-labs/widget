import { NEVER_ACT_INPUT_TYPES } from './act-types';

/**
 * Recheck native action meaning before dispatch. These values stay local: URLs
 * and form metadata must not be copied into the agent's tool reply.
 * Host JavaScript is still responsible for its own event-handler behavior.
 */
export function captureActionMeaning(element: HTMLElement): () => boolean {
  const reference = new WeakRef(element);
  const approved = activationTargets(element).map((node) => {
    const target = readTarget(node);
    return {
      ...target,
      element: new WeakRef(target.element),
      form: target.form ? new WeakRef(target.form) : null,
      labelControl: target.labelControl
        ? new WeakRef(target.labelControl)
        : null,
    };
  });
  return () => {
    const element = reference.deref();
    if (!element) return false;
    if (!element.isConnected || element.getRootNode() !== document)
      return false;
    const current = activationTargets(element).map(readTarget);
    return (
      current.length === approved.length &&
      current.every((target, index) => {
        const before = approved[index]!;
        return (
          target.allowed &&
          target.element === before.element.deref() &&
          target.form === (before.form?.deref() ?? null) &&
          target.labelControl === (before.labelControl?.deref() ?? null) &&
          target.semantics === before.semantics
        );
      })
    );
  };
}

function activationTargets(element: HTMLElement): Element[] {
  // A role-button can activate a native ancestor; a label can forward its
  // click to another control. Bind those actual activation owners too.
  const targets: Element[] = [];
  const visited = new Set<Element>();
  const visit = (start: Element) => {
    for (let node: Element | null = start; node; node = node.parentElement) {
      if (visited.has(node)) break;
      visited.add(node);
      if (
        node === element ||
        node.matches('a[href],area[href],button,input,select,textarea,label')
      )
        targets.push(node);
      if (node instanceof HTMLLabelElement && node.control) visit(node.control);
    }
  };
  visit(element);
  return targets;
}

function readTarget(element: Element) {
  const link =
    element instanceof HTMLAnchorElement || element instanceof HTMLAreaElement
      ? element
      : null;
  const control =
    element instanceof HTMLButtonElement ||
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
      ? element
      : null;
  const form = control?.form ?? null;
  const baseTarget = element.ownerDocument
    .querySelector('base[target]')
    ?.getAttribute('target');
  return {
    element,
    form,
    labelControl: element instanceof HTMLLabelElement ? element.control : null,
    allowed: !(
      element instanceof HTMLInputElement &&
      NEVER_ACT_INPUT_TYPES.has(element.type)
    ),
    semantics: JSON.stringify([
      element.tagName,
      element.getAttribute('role'),
      control?.type,
      control?.name,
      element instanceof HTMLButtonElement ||
      (element instanceof HTMLInputElement &&
        ['submit', 'image', 'reset'].includes(element.type))
        ? element.value
        : null,
      link?.href,
      link?.getAttribute('target') ?? baseTarget,
      link?.getAttribute('download'),
      link?.getAttribute('rel'),
      link?.getAttribute('ping'),
      form?.action,
      form?.method,
      form?.getAttribute('target') ?? baseTarget,
      form?.enctype,
      form?.noValidate,
      ...[
        'formaction',
        'formmethod',
        'formtarget',
        'formenctype',
        'formnovalidate',
      ].map((name) => element.getAttribute(name)),
      // Resolved URL properties catch a changed <base href> as well.
      element instanceof HTMLButtonElement ||
      element instanceof HTMLInputElement
        ? [
            element.formAction,
            element.formMethod,
            element.formTarget,
            element.formEnctype,
            element.formNoValidate,
          ]
        : null,
    ]),
  };
}
