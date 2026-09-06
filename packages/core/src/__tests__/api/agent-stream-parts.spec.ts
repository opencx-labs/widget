import { expect, suite, test } from 'vitest';
import {
  isAgentStreamKeepalive,
  isTurnSteeredPart,
} from '../../api/agent-stream-parts';

suite('agent stream parts', () => {
  test('recognises the idle heartbeat and nothing else', () => {
    expect(isAgentStreamKeepalive({ type: 'data-keepalive' })).toBe(true);
    expect(isAgentStreamKeepalive({ type: 'data-turn-steered' })).toBe(false);
    expect(isAgentStreamKeepalive({ type: 'start' })).toBe(false);
  });

  test('recognises a steer and nothing else', () => {
    expect(isTurnSteeredPart({ type: 'data-turn-steered' })).toBe(true);
    expect(isTurnSteeredPart({ type: 'data-keepalive' })).toBe(false);
    expect(isTurnSteeredPart({ type: 'data-turn-settled' })).toBe(false);
    expect(isTurnSteeredPart({ type: 'error' })).toBe(false);
  });
});
