import { resolveTriggerAction } from '../triggers';

const el = (html: string): Element => {
  const container = document.createElement('div');
  container.innerHTML = html;
  return container.firstElementChild!;
};

suite('resolveTriggerAction', () => {
  test('data-opencx-open → open', () => {
    expect(resolveTriggerAction(el('<a data-opencx-open>Chat</a>'))).toEqual({
      kind: 'open',
    });
  });

  test('data-opencx-prefill → prefill with its value', () => {
    expect(
      resolveTriggerAction(
        el('<a data-opencx-prefill="How do I withdraw?">x</a>'),
      ),
    ).toEqual({ kind: 'prefill', value: 'How do I withdraw?' });
  });

  test('data-opencx-ask → ask with its value', () => {
    expect(
      resolveTriggerAction(
        el('<a data-opencx-ask="What are your fees?">x</a>'),
      ),
    ).toEqual({ kind: 'ask', value: 'What are your fees?' });
  });

  test('data-opencx-answer → answer with its value', () => {
    expect(
      resolveTriggerAction(
        el('<a data-opencx-answer="Onboarding ~2 min">x</a>'),
      ),
    ).toEqual({ kind: 'answer', value: 'Onboarding ~2 min' });
  });

  test('an empty attribute value is preserved (not treated as missing)', () => {
    expect(resolveTriggerAction(el('<a data-opencx-prefill="">x</a>'))).toEqual(
      {
        kind: 'prefill',
        value: '',
      },
    );
  });

  test('resolves from the nearest trigger ancestor when a child is clicked', () => {
    const trigger = el('<a data-opencx-prefill="Q"><span>label</span></a>');
    const child = trigger.querySelector('span');
    expect(resolveTriggerAction(child)).toEqual({
      kind: 'prefill',
      value: 'Q',
    });
  });

  test('precedence: prefill wins over open on the same element', () => {
    expect(
      resolveTriggerAction(
        el('<a data-opencx-open data-opencx-prefill="Q">x</a>'),
      ),
    ).toEqual({ kind: 'prefill', value: 'Q' });
  });

  test('precedence: ask wins over answer', () => {
    expect(
      resolveTriggerAction(
        el('<a data-opencx-ask="A" data-opencx-answer="B">x</a>'),
      ),
    ).toEqual({ kind: 'ask', value: 'A' });
  });

  test('a non-trigger element → null', () => {
    expect(resolveTriggerAction(el('<a href="#">plain</a>'))).toBeNull();
  });

  test('a non-Element target → null', () => {
    expect(resolveTriggerAction(null)).toBeNull();
    expect(resolveTriggerAction(document.createTextNode('hi'))).toBeNull();
  });
});
