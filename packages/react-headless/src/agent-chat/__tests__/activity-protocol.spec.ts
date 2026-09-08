import { readUIMessageStream, type UIMessageChunk } from 'ai';
import { expect, it } from 'vitest';
import { mapUiPartsToItems } from '../agent-chat-stream';

it('updates one status step through the real stream assembler without inputs or outputs', async () => {
  const chunks: UIMessageChunk[] = [
    { type: 'start', messageId: 'message' },
    {
      type: 'data-tool-activity',
      id: 'lookup',
      data: { toolCallId: 'lookup', label: 'Find order', done: false },
    },
    {
      type: 'data-tool-activity',
      id: 'lookup',
      data: { toolCallId: 'lookup', label: 'Find order', done: true },
    },
    { type: 'text-start', id: 'text' },
    { type: 'text-delta', id: 'text', delta: 'Shipped' },
    { type: 'text-end', id: 'text' },
    { type: 'finish' },
  ];
  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  const snapshots = [];
  for await (const message of readUIMessageStream({ stream }))
    snapshots.push(message);
  const final = snapshots.at(-1);
  expect(final).toBeDefined();
  expect(mapUiPartsToItems(final?.parts ?? [])).toEqual([
    {
      kind: 'steps',
      steps: [{ kind: 'tool', label: 'Find order', done: true }],
    },
    { kind: 'text', text: 'Shipped' },
  ]);
});
