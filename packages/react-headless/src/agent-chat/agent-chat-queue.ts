/**
 * A bounded FIFO buffer for multi-send. While an agent turn is streaming
 * (useChat `status !== 'ready'`) the user's sends are queued here and drained
 * one-per-turn when the turn ends — by finishing, erroring, or being stopped.
 * Once accepted, an item is never displaced by a later enqueue: capacity
 * rejects the newest proposal so its caller can keep the payload intact.
 */
export class AgentChatQueue<T> {
  private buffer: T[] = [];
  /** Effective cap is at least 1. */
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
   * Append an item when capacity permits. Returns `false` without mutating
   * the accepted FIFO backlog when full.
   */
  enqueue(item: T): boolean {
    if (this.buffer.length >= this.cap) return false;
    this.buffer.push(item);
    return true;
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
