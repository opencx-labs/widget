import isEqual from 'lodash.isequal';
import { log } from './log';

export type Subscriber<T> = (data: T) => void;

export class PrimitiveState<S> {
  private subscribers = new Set<Subscriber<S>>();
  private state: S;
  private initialState: S;

  constructor(state: S) {
    this.state = state;
    this.initialState = state;
  }

  get = (): S => this.state;

  set = (newState: S): void => {
    if (!isEqual(this.state, newState)) {
      this.state = newState;
      this.notifySubscribers(newState);
    }
  };

  setPartial = (_s: Partial<S>): void => {
    if (_s === undefined || _s === null) return;
    const newState = { ...this.state, ..._s };
    this.set(newState);
  };

  reset = (): void => {
    this.set(this.initialState);
  };

  private notifySubscribers = (state: S) => {
    const subscribersArray = Array.from(this.subscribers);
    subscribersArray.forEach((callback) => {
      try {
        callback(state);
      } catch (error) {
        if (import.meta.env.MODE !== 'test') {
          log.error('state subscriber threw', error);
        }
      }
    });
  };

  subscribe = (callback: Subscriber<S>): (() => void) => {
    this.subscribers.add(callback);

    return () => {
      this.subscribers.delete(callback);
    };
  };
}
