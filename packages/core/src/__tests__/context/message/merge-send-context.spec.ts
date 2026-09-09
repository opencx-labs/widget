import { describe, expect, it, vi } from 'vitest';
import {
  mergeSendContext,
  resolveConfigContext,
} from '../../../context/message.ctx';
import type { WidgetConfig } from '../../../types/widget-config';

const baseConfig = (context: WidgetConfig['context']): WidgetConfig => ({
  token: 't',
  context,
});

/** The org's page-context feature on and the embed silent. */
const sends = { sendsPageContext: true };

describe('mergeSendContext / resolveConfigContext', () => {
  it('preserves background continuations when page context is disabled', () => {
    expect(
      mergeSendContext(
        { token: 't' },
        { content: 'Connection ready', background: true },
        { sendsPageContext: false },
      ).clientContext,
    ).toEqual({ opencx__background: true });
  });

  it('object-form context passes through as before', () => {
    const merged = mergeSendContext(
      baseConfig({ page: { url: '/inbox' } }),
      { content: 'hi' },
      sends,
    );
    expect(merged.clientContext).toEqual({ page: { url: '/inbox' } });
  });

  it('function-form context resolves FRESH at every send (SPA current page)', () => {
    let path = '/inbox';
    const config = baseConfig(() => ({ page: { url: path } }));
    expect(
      mergeSendContext(config, { content: 'a' }, sends).clientContext,
    ).toEqual({
      page: { url: '/inbox' },
    });
    path = '/reports';
    expect(
      mergeSendContext(config, { content: 'b' }, sends).clientContext,
    ).toEqual({
      page: { url: '/reports' },
    });
  });

  it('per-send clientContext merges OVER the resolved config context', () => {
    const merged = mergeSendContext(
      baseConfig(() => ({ page: { url: '/inbox' }, a: 1 })),
      {
        content: 'hi',
        clientContext: { picked_elements: [{ name: 'btn' }], a: 2 },
      },
      sends,
    );
    expect(merged.clientContext).toEqual({
      page: { url: '/inbox' },
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
      mergeSendContext(config, { content: 'hi' }, sends).clientContext,
    ).toBeUndefined();
    consoleError.mockRestore();
  });

  it('withPageEntity: false drops only the entity from the send, keeping page and host data', () => {
    const entity = { type: 'instruction', id: 'i-1', title: 'Payments' };
    const config = baseConfig({
      page: { url: '/ai-instructions' },
      entity,
      tenant: 'acme',
    });
    expect(
      mergeSendContext(config, { content: 'a' }, sends).clientContext,
    ).toEqual({
      page: { url: '/ai-instructions' },
      entity,
      tenant: 'acme',
    });
    expect(
      mergeSendContext(config, { content: 'b', withPageEntity: false }, sends)
        .clientContext,
    ).toEqual({ page: { url: '/ai-instructions' }, tenant: 'acme' });
    // Dismissing on a send with per-message context still merges the rest.
    expect(
      mergeSendContext(
        config,
        {
          content: 'c',
          withPageEntity: false,
          clientContext: { page_marks: [] },
        },
        sends,
      ).clientContext,
    ).toEqual({
      page: { url: '/ai-instructions' },
      tenant: 'acme',
      page_marks: [],
    });
  });

  it('withPageEntity: false on a context that is only an entity sends no context at all', () => {
    const config = baseConfig({
      entity: { type: 'order', id: 'o-1', title: '#1' },
    });
    expect(
      mergeSendContext(config, { content: 'a', withPageEntity: false }, sends)
        .clientContext,
    ).toBeUndefined();
  });

  it('sendsPageContext: false keeps the host context (page, entity, host data) and drops only the widget page marks', () => {
    const config = baseConfig(() => ({
      page: { url: '/inbox' },
      entity: { type: 'order', id: 'o-1', title: '#1' },
      tenant: 'acme',
    }));
    const merged = mergeSendContext(
      config,
      {
        content: 'hi',
        customData: { plan: 'pro' },
        clientContext: { page_marks: [{ elements: [{ name: 'btn' }] }] },
      },
      { sendsPageContext: false },
    );
    expect(merged.clientContext).toEqual({
      page: { url: '/inbox' },
      entity: { type: 'order', id: 'o-1', title: '#1' },
      tenant: 'acme',
    });
    expect(merged.custom_data).toEqual({ plan: 'pro' });
  });

  it('sendsPageContext: false with no host context sends none at all', () => {
    const merged = mergeSendContext(
      baseConfig(undefined),
      { content: 'hi', clientContext: { page_marks: [] } },
      { sendsPageContext: false },
    );
    expect(merged.clientContext).toBeUndefined();
  });
});
