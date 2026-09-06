import { PrimitiveState } from '../../utils/PrimitiveState';

suite(PrimitiveState.name, () => {
  suite('constructor', () => {
    it('should initialize with initial state', () => {
      const state = new PrimitiveState({ count: 0 });
      expect(state.get()).toEqual({ count: 0 });
    });
  });

  suite(new PrimitiveState('').set.name, () => {
    it('should update the state', () => {
      const state = new PrimitiveState({ count: 0 });
      state.set({ count: 1 });
      expect(state.get()).toEqual({ count: 1 });
    });
  });

  suite(new PrimitiveState('').setPartial.name, () => {
    it('should update the state', () => {
      const state = new PrimitiveState({ count: 0, text: 'hello' });
      state.setPartial({ count: 1 });
      expect(state.get()).toEqual({ count: 1, text: 'hello' });
    });

    it('should ignore `undefined` state updates', () => {
      const state = new PrimitiveState({ count: 0 });
      // @ts-expect-error The function's type def doesn't accept undefined, but in case it was provided at runtime, it should be ignored
      state.setPartial(undefined);
      expect(state.get()).toEqual({ count: 0 });
    });

    it('should ignore `null` state updates', () => {
      const state = new PrimitiveState({ count: 0 });
      // @ts-expect-error The function's type def doesn't accept null, but in case it was provided at runtime, it should be ignored
      state.setPartial(null);
      expect(state.get()).toEqual({ count: 0 });
    });
  });

  suite(new PrimitiveState('').get.name, () => {
    it('should get the latest state', () => {
      const state = new PrimitiveState({ count: 0 });
      state.set({ count: 1 });
      expect(state.get()).toEqual({ count: 1 });
    });
  });

  suite(new PrimitiveState('').reset.name, () => {
    it('should go back to initial state', () => {
      const state = new PrimitiveState({ count: 0 });
      state.set({ count: 1 });
      state.reset();
      expect(state.get()).toEqual({ count: 0 });
    });
  });

  suite(new PrimitiveState('').subscribe.name, () => {
    it('should notify subscribers when state changes', () => {
      const state = new PrimitiveState({ count: 0 });
      const subscriber = vi.fn();
      state.subscribe(subscriber);

      state.set({ count: 1 });
      expect(subscriber).toHaveBeenCalledWith({ count: 1 });
    });

    it('should notify subscribers on partial state updates', () => {
      const state = new PrimitiveState({ count: 0, text: 'hello' });
      const subscriber = vi.fn();
      state.subscribe(subscriber);

      state.setPartial({ count: 1 });
      expect(subscriber).toHaveBeenCalledWith({ count: 1, text: 'hello' });
    });

    it('should notify subscribers once on every update', () => {
      const state = new PrimitiveState({ count: 0, text: 'hello' });
      const subscriber = vi.fn();
      state.subscribe(subscriber);

      state.setPartial({ count: 1 });
      expect(subscriber).toHaveBeenCalledTimes(1);
      state.setPartial({ count: 2 });
      expect(subscriber).toHaveBeenCalledTimes(2);
    });

    it('should not notify subscribers on redundant set state calls', () => {
      const state = new PrimitiveState({ count: 0, text: 'hello' });
      const subscriber = vi.fn();
      state.subscribe(subscriber);

      state.setPartial({ count: 1 });
      state.setPartial({ count: 1 });
      state.setPartial({ count: 1 });
      expect(subscriber).toHaveBeenCalledTimes(1);
    });

    it('should notify subscribers when state is reset', () => {
      const state = new PrimitiveState({ count: 0 });
      const subscriber = vi.fn();
      state.subscribe(subscriber);

      state.set({ count: 1 });
      expect(subscriber).toHaveBeenCalledTimes(1);
      state.reset();
      expect(subscriber).toHaveBeenCalledTimes(2);
    });

    it('should allow multiple subscribers', () => {
      const state = new PrimitiveState({ count: 0 });
      const subscriber1 = vi.fn();
      const subscriber2 = vi.fn();

      state.subscribe(subscriber1);
      state.subscribe(subscriber2);

      state.set({ count: 1 });
      expect(subscriber1).toHaveBeenCalledWith({ count: 1 });
      expect(subscriber2).toHaveBeenCalledWith({ count: 1 });
    });

    it('should unsubscribe correctly', () => {
      const state = new PrimitiveState({ count: 0 });
      const subscriber = vi.fn();
      const unsubscribe = state.subscribe(subscriber);

      unsubscribe();
      state.set({ count: 1 });
      expect(subscriber).not.toHaveBeenCalled();
    });

    it('should handle multiple subscriptions and unsubscriptions', () => {
      const state = new PrimitiveState({ count: 0 });
      const subscriber1 = vi.fn();
      const subscriber2 = vi.fn();
      const subscriber3 = vi.fn();

      state.subscribe(subscriber1);
      const unsubscribe2 = state.subscribe(subscriber2);
      state.subscribe(subscriber3);

      unsubscribe2();
      state.set({ count: 1 });

      expect(subscriber1).toHaveBeenCalledWith({ count: 1 });
      expect(subscriber2).not.toHaveBeenCalled();
      expect(subscriber3).toHaveBeenCalledWith({ count: 1 });
    });

    it('should handle subscriber errors gracefully', () => {
      const state = new PrimitiveState({ count: 0 });
      const errorSubscriber = () => {
        throw new Error('Subscriber error');
      };
      const normalSubscriber = vi.fn();

      state.subscribe(errorSubscriber);
      state.subscribe(normalSubscriber);

      // This should not throw
      state.set({ count: 1 });
      expect(normalSubscriber).toHaveBeenCalledWith({ count: 1 });
    });

    it('should handle unsubscribe being called multiple times', () => {
      const state = new PrimitiveState({ count: 0 });
      const subscriber = vi.fn();
      const unsubscribe = state.subscribe(subscriber);

      unsubscribe();
      unsubscribe(); // Should not throw or cause issues
      state.set({ count: 1 });
      expect(subscriber).not.toHaveBeenCalled();
    });
  });
});
