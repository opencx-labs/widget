import { describe, expect, it } from 'vitest';
import { AgentChatQueue } from '../agent-chat-queue';

describe('AgentChatQueue', () => {
  it('drains in FIFO order', () => {
    const queue = new AgentChatQueue<string>(5);
    queue.enqueue('a');
    queue.enqueue('b');
    queue.enqueue('c');

    expect(queue.dequeueNext()).toBe('a');
    expect(queue.dequeueNext()).toBe('b');
    expect(queue.dequeueNext()).toBe('c');
    expect(queue.dequeueNext()).toBeNull();
  });

  it('drops the OLDEST item past the bound and returns it', () => {
    const queue = new AgentChatQueue<string>(2);
    expect(queue.enqueue('a')).toBeNull();
    expect(queue.enqueue('b')).toBeNull();
    expect(queue.enqueue('c')).toBe('a');

    expect(queue.size).toBe(2);
    expect([...queue.items]).toEqual(['b', 'c']);
  });

  it('exposes a read-only snapshot of pending items, oldest first', () => {
    const queue = new AgentChatQueue<string>(5);
    queue.enqueue('a');
    queue.enqueue('b');

    expect([...queue.items]).toEqual(['a', 'b']);
    expect(queue.size).toBe(2);
  });

  it('dequeueNext() is null on an empty queue', () => {
    const queue = new AgentChatQueue<string>(5);
    expect(queue.dequeueNext()).toBeNull();
  });

  it('treats a non-positive bound as "keep only the newest"', () => {
    const queue = new AgentChatQueue<string>(0);
    queue.enqueue('a');
    expect(queue.enqueue('b')).toBe('a');
    expect([...queue.items]).toEqual(['b']);
  });

  it('removeWhere() removes the first match and keeps order', () => {
    const queue = new AgentChatQueue<string>(5);
    queue.enqueue('a');
    queue.enqueue('b');
    queue.enqueue('c');

    expect(queue.removeWhere((item) => item === 'b')).toBe('b');
    expect([...queue.items]).toEqual(['a', 'c']);
  });

  it('removeWhere() is null when nothing matches', () => {
    const queue = new AgentChatQueue<string>(5);
    queue.enqueue('a');

    expect(queue.removeWhere((item) => item === 'zzz')).toBeNull();
    expect(queue.size).toBe(1);
  });
});
