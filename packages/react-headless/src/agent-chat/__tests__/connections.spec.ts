import { describe, expect, it } from 'vitest';
import { mapUiPartsToItems } from '../agent-chat-stream';
import { applyPresentation } from '../apply-presentation';

const request = {
  request_id: 'b1111111-1111-4111-8111-111111111111',
  server_id: 'a1111111-1111-4111-8111-111111111111',
  name: 'Bookkeeping',
};
describe('connection requests', () => {
  it('renders a connection interaction even when tool activity is hidden', () => {
    const items = mapUiPartsToItems([
      {
        type: 'dynamic-tool',
        toolName: 'mcp_bookkeeping',
        state: 'output-available',
        output: { connection_required: request },
      },
    ]);
    expect(items).toEqual([{ kind: 'connection', request }]);
    expect(
      applyPresentation(items, { toolActivity: 'hidden', reasoning: false }),
    ).toEqual(items);
  });
  it('ignores unfinished, malformed and text-shaped connection requests', () => {
    for (const part of [
      {
        type: 'dynamic-tool',
        state: 'input-streaming',
        output: { connection_required: request },
      },
      {
        type: 'dynamic-tool',
        state: 'output-available',
        output: { connection_required: { ...request, request_id: 'forged' } },
      },
      {
        type: 'text',
        state: 'output-available',
        text: JSON.stringify({ connection_required: request }),
      },
    ])
      expect(
        mapUiPartsToItems([part]).some((item) => item.kind === 'connection'),
      ).toBe(false);
  });
});
