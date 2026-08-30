import { PrimitiveState } from './PrimitiveState';

export type PollingState = {
  isPolling: boolean;
  isError: boolean;
};

export class Poller {
  state = new PrimitiveState<PollingState>({
    isPolling: false,
    isError: false,
  });
  private abortController = new AbortController();

  reset = () => {
    this.abortController.abort('Resetting poller');
    this.stopPolling?.();
    this.stopPolling = null;
  };

  private stopPolling: (() => void) | null = null;

  startPolling = (
    cb: (abortSignal: AbortSignal) => Promise<void>,
    intervalMs: number,
  ) => {
    if (this.stopPolling) return;

    const timeouts: NodeJS.Timeout[] = [];

    const poll = async () => {
      this.abortController = new AbortController();
      this.state.setPartial({ isPolling: true });

      try {
        await cb(this.abortController.signal);
      } catch (error) {
        if (this.abortController.signal.aborted) {
          // If aborted, just return and do not schedule the nest poll
          return;
        }
        console.error('Failed to poll:', error);
        this.state.setPartial({ isError: true });
      } finally {
        this.state.setPartial({ isPolling: false });
      }

      // Do not reschedule after a reset, including when the callback handles
      // cancellation without throwing.
      if (!this.abortController.signal.aborted) {
        timeouts.push(setTimeout(poll, intervalMs));
      }
    };

    poll();

    this.stopPolling = () => {
      timeouts.forEach(clearTimeout);
      this.state.reset();
    };
  };
}
