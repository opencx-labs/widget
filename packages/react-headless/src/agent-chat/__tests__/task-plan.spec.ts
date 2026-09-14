import { expect, it } from 'vitest';
import { mapUiPartsToItems } from '../agent-chat-stream';

it('updates the existing checklist without replacing a rich reply or exposing raw planning arguments', () => {
  const items = mapUiPartsToItems([
    {
      type: 'data-plan',
      data: { plan: [{ step: 'Check balance', status: 'pending' }] },
    },
    { type: 'text', text: 'Your balance is ready.', state: 'done' },
    { type: 'data-spec', data: { root: 'balance' } },
    {
      type: 'data-plan',
      data: { plan: [{ step: 'Balance verified: €20', status: 'completed' }] },
    },
  ]);
  expect(items).toEqual([
    {
      kind: 'plan',
      plan: [{ step: 'Balance verified: €20', status: 'completed' }],
    },
    { kind: 'text', text: 'Your balance is ready.' },
    { kind: 'spec', parts: [{ type: 'data-spec', data: { root: 'balance' } }] },
  ]);
  expect(
    mapUiPartsToItems([
      {
        type: 'data-plan',
        data: { plan: [{ step: 'Bad state', status: 'invented' }] },
      },
    ]),
  ).toEqual([]);
});
