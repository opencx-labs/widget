/**
 * A bounded FIFO buffer for v5 multi-send. While an agent-v3 turn is streaming
 * (useChat `status !== 'ready'`) the user's sends are queued here and drained
 * one-per-turn when the turn ends — by finishing, erroring, or being STOPPED
 * (a stop cancels the live response and the next queued message is sent
 * immediately; it never discards the queue). Past the bound the OLDEST pending
 * send is dropped (the most stale intent) so a burst can never grow the
 * backlog without limit.
 *
 * Pure and framework-agnostic so the queue behaviour is unit-tested in isolation
 * (the react hook only wires `dequeueNext()` to the turn boundaries).
 */
export class AgentChatQueue<T> {
  private buffer: T[] = [];
  /** Effective cap is at least 1 — a queue must keep the latest intent. */
  private readonly cap: number;

  constructor(max: number) {
    this.cap = Math.max(1, Math.floor(max));
  }

  get size(): number {
    return this.buffer.length;
  }

  /** Read-only snapshot of pending items, oldest first. */
  get items(): readonly T[] {
    return this.buffer;
  }

  /**
   * Append an item. If that pushes the buffer past the bound, drop the OLDEST
   * item and return it (so the caller can react); otherwise return `null`.
   */
  enqueue(item: T): T | null {
    this.buffer.push(item);
    if (this.buffer.length > this.cap) {
      return this.buffer.shift() ?? null;
    }
    return null;
  }

  /** Remove and return the next item (FIFO), or `null` when empty. */
  dequeueNext(): T | null {
    return this.buffer.shift() ?? null;
  }

  /**
   * Remove and return the first item matching `predicate`, or `null` when
   * nothing matches. Used by the queue pill's per-message remove button.
   */
  removeWhere(predicate: (item: T) => boolean): T | null {
    const index = this.buffer.findIndex(predicate);
    if (index === -1) return null;
    const [removed] = this.buffer.splice(index, 1);
    return removed ?? null;
  }
}
