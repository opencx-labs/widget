import { describe, expect, it } from 'vitest';
import { ComponentRegistry } from '../ComponentRegistry';

const fallback = () => null;
const builtIn = () => null;
const replacement = () => null;
const latest = () => null;

const questionKeys = [
  'agent_chat_questions',
  'AGENT_CHAT_QUESTIONS',
  'Agent_Chat_Questions',
];

describe('ComponentRegistry renderer replacement', () => {
  it.each(questionKeys)('replaces the active renderer for %s', (key) => {
    const registry = new ComponentRegistry({
      components: [
        { key: 'fallback', component: fallback },
        { key: 'agent_chat_questions', component: builtIn },
      ],
    });
    expect(registry.getComponent(key)).toBe(builtIn);

    registry.register({ key, component: replacement });
    for (const lookupKey of questionKeys) {
      expect(registry.getComponent(lookupKey)).toBe(replacement);
    }
    expect(registry.components).toHaveLength(2);
    expect(registry.getComponent('fallback')).toBe(fallback);

    registry.register({ key: 'Agent_Chat_Questions', component: latest });
    expect(registry.getComponent(key)).toBe(latest);
    expect(registry.components).toHaveLength(2);
  });

  it('uses the last case-variant registration when constructed with duplicates', () => {
    const registry = new ComponentRegistry({
      components: [
        { key: 'FALLBACK', component: builtIn },
        { key: 'fallback', component: fallback },
        { key: 'agent_chat_questions', component: builtIn },
        { key: 'AGENT_CHAT_QUESTIONS', component: replacement },
        { key: 'Agent_Chat_Questions', component: latest },
      ],
    });
    expect(registry.getComponent('FALLBACK')).toBe(fallback);
    expect(registry.getComponent('agent_chat_questions')).toBe(latest);
    expect(registry.components).toHaveLength(2);
    expect(registry.getComponent('unknown')).toBeUndefined();
  });
});
