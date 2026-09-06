import { describe, expect, it } from 'vitest';
import { widgetCatalog } from '../catalog';
import { widgetUiPrompt } from '../ui-prompt';

/**
 * Guards the SLIM shape of the widget UI prompt. The full
 * `catalog.prompt({ mode: 'inline' })` output (~19KB of state model / repeat /
 * events / watchers / dynamic props) made the chat model reason for 85s+
 * before its first token and blow the 180s agent chat turn ceiling — the slim
 * prompt is display-only with all data inline in props. A future change that
 * reintroduces the full contract (or lets the catalog section drift out of
 * the prompt) would silently regress turn latency.
 */
describe('widgetUiPrompt (slim display-only contract)', () => {
  it('contains the spec fence protocol and the patch format', () => {
    expect(widgetUiPrompt).toContain('```spec');
    expect(widgetUiPrompt).toContain(
      '{"op":"add","path":"/root","value":"main"}',
    );
  });

  it('embeds the generated AVAILABLE COMPONENTS section so props/descriptions never drift from the catalog', () => {
    expect(widgetCatalog.componentNames).not.toHaveLength(0);
    expect(widgetUiPrompt).toContain(
      `AVAILABLE COMPONENTS (${widgetCatalog.componentNames.length})`,
    );
    for (const name of widgetCatalog.componentNames) {
      expect(widgetUiPrompt).toContain(`- ${name}: {`);
    }
  });

  it('stays display-only: NO state model / repeat / events / watchers machinery', () => {
    // Section headers from the full generated prompt that must never reappear.
    for (const banned of [
      'INITIAL STATE',
      'DYNAMIC LISTS',
      'ARRAY STATE ACTIONS',
      'STATE WATCHERS',
      'VISIBILITY CONDITIONS',
      'DYNAMIC PROPS',
      'AVAILABLE ACTIONS',
      '$bindState',
      'pushState',
    ]) {
      expect(
        widgetUiPrompt,
        `slim prompt must not document "${banned}"`,
      ).not.toContain(banned);
    }
  });

  it('stays an order of magnitude smaller than the full generated contract', () => {
    const full = widgetCatalog.prompt({ mode: 'inline' });
    expect(widgetUiPrompt.length).toBeLessThan(full.length / 2);
  });

  it('keeps the inline-data and minimal-layout rules', () => {
    expect(widgetUiPrompt).toContain('ALL data goes inline in props');
    expect(widgetUiPrompt).toContain(
      'Only Card, Stack, and Grid accept children',
    );
    expect(widgetUiPrompt).toContain('NEVER use emojis');
  });
});

describe('widgetCatalog prompt shape', () => {
  it('declares List href as an optional string, not the opaque sanitizer', () => {
    // The registry parses href through a transform (javascript:/relative URLs
    // dropped); json-render's prompt printer cannot see through it and would
    // print a required `href: unknown`, which the model then tries to satisfy.
    const prompt = widgetCatalog.prompt({ mode: 'inline' });
    expect(prompt).toContain('href?: string');
    expect(prompt).not.toContain('href: unknown');
  });

  it('lists the tool-built PhoneAgentCard so a verbatim tool fence stays in contract', () => {
    const prompt = widgetCatalog.prompt({ mode: 'inline' });
    expect(prompt).toContain(
      'PhoneAgentCard: { agentId: string, agentName: string, model?: string }',
    );
    expect(prompt).toContain('NEVER author this yourself');
  });
});
