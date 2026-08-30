import { describe, expect, it, vi } from 'vitest';
import {
  mergeSendContext,
  resolveConfigContext,
} from '../../../context/message.ctx';
import type { WidgetConfig } from '../../../types/widget-config';

const baseConfig = (context: WidgetConfig['context']): WidgetConfig =>
  ({ token: 't', context }) as WidgetConfig;

describe('mergeSendContext / resolveConfigContext', () => {
  it('object-form context passes through as before', () => {
    const merged = mergeSendContext(baseConfig({ page: '/inbox' }), {
      content: 'hi',
    });
    expect(merged.clientContext).toEqual({ page: '/inbox' });
  });

  it('function-form context resolves FRESH at every send (SPA current page)', () => {
    let path = '/inbox';
    const config = baseConfig(() => ({ page: path }));
    expect(mergeSendContext(config, { content: 'a' }).clientContext).toEqual({
      page: '/inbox',
    });
    path = '/reports';
    expect(mergeSendContext(config, { content: 'b' }).clientContext).toEqual({
      page: '/reports',
    });
  });

  it('per-send clientContext merges OVER the resolved config context', () => {
    const merged = mergeSendContext(
      baseConfig(() => ({ page: '/inbox', a: 1 })),
      {
        content: 'hi',
        clientContext: { picked_elements: [{ name: 'btn' }], a: 2 },
      },
    );
    expect(merged.clientContext).toEqual({
      page: '/inbox',
      a: 2,
      picked_elements: [{ name: 'btn' }],
    });
  });

  it('a throwing getter degrades to no context — the send is never blocked', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const config = baseConfig(() => {
      throw new Error('boom');
    });
    expect(resolveConfigContext(config)).toBeUndefined();
    expect(
      mergeSendContext(config, { content: 'hi' }).clientContext,
    ).toBeUndefined();
    consoleError.mockRestore();
  });
});
