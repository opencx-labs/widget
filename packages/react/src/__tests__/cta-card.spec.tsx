import { fireEvent, render, screen } from '@testing-library/react';
import type { CtaButton, CtaConfig } from '@opencx/widget-core';
import { CtaCard } from '../CtaCard';

const noop = () => undefined;

const baseCta: CtaConfig = {
  title: 'Do you have any questions?',
  body: 'The team is online.',
  avatarUrls: ['https://x.com/a.png', 'https://x.com/b.png'],
  buttons: [
    { text: 'Chat with us', action: 'open-chat' },
    { text: 'Sign up free', action: 'url', url: 'https://x.com/signup' },
  ],
  composer: { placeholder: 'Write a message…' },
};

suite('CtaCard', () => {
  test('renders title, body, image, avatars, and all buttons', () => {
    render(
      <CtaCard
        cta={{ ...baseCta, imageUrl: 'https://x.com/hero.png' }}
        onButtonClick={noop}
        onComposerSubmit={noop}
        onDismiss={noop}
      />,
    );
    expect(screen.getByText('Do you have any questions?')).toBeTruthy();
    expect(screen.getByText('The team is online.')).toBeTruthy();
    expect(screen.getByText('Chat with us')).toBeTruthy();
    expect(screen.getByText('Sign up free')).toBeTruthy();
    // hero image + 2 avatars
    expect(document.querySelectorAll('img').length).toBe(3);
  });

  test('optional sections are omitted when not configured', () => {
    render(
      <CtaCard
        cta={{ title: 'Hi' }}
        onButtonClick={noop}
        onComposerSubmit={noop}
        onDismiss={noop}
      />,
    );
    expect(document.querySelectorAll('img').length).toBe(0);
    expect(document.querySelector('form')).toBeNull();
    expect(document.querySelectorAll('[data-component="cta/btn"]').length).toBe(
      0,
    );
  });

  test('button click reports the button object and its index', () => {
    const clicks: Array<{ button: CtaButton; index: number }> = [];
    render(
      <CtaCard
        cta={baseCta}
        onButtonClick={(button, index) => clicks.push({ button, index })}
        onComposerSubmit={noop}
        onDismiss={noop}
      />,
    );
    fireEvent.click(screen.getByText('Sign up free'));
    expect(clicks).toEqual([
      {
        button: { text: 'Sign up free', action: 'url', url: 'https://x.com/signup' },
        index: 1,
      },
    ]);
  });

  test('dismiss X fires onDismiss', () => {
    let dismissed = 0;
    render(
      <CtaCard
        cta={baseCta}
        onButtonClick={noop}
        onComposerSubmit={noop}
        onDismiss={() => dismissed++}
      />,
    );
    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(dismissed).toBe(1);
  });

  test('composer submits trimmed text and clears the input', () => {
    const sent: string[] = [];
    render(
      <CtaCard
        cta={baseCta}
        onButtonClick={noop}
        onComposerSubmit={(text) => sent.push(text)}
        onDismiss={noop}
      />,
    );
    const input = screen.getByPlaceholderText('Write a message…');
    fireEvent.change(input, { target: { value: '  hello  ' } });
    fireEvent.submit(input.closest('form')!);
    expect(sent).toEqual(['hello']);
    expect(screen.getByPlaceholderText('Write a message…')).toHaveProperty(
      'value',
      '',
    );
  });

  test('composer ignores empty / whitespace-only submissions', () => {
    const sent: string[] = [];
    render(
      <CtaCard
        cta={baseCta}
        onButtonClick={noop}
        onComposerSubmit={(text) => sent.push(text)}
        onDismiss={noop}
      />,
    );
    const input = screen.getByPlaceholderText('Write a message…');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.submit(input.closest('form')!);
    expect(sent).toEqual([]);
  });

  test('every section carries its data-component name for cssOverrides', () => {
    render(
      <CtaCard
        cta={{ ...baseCta, imageUrl: 'https://x.com/hero.png' }}
        onButtonClick={noop}
        onComposerSubmit={noop}
        onDismiss={noop}
      />,
    );
    for (const name of [
      'cta/root',
      'cta/dismiss_btn',
      'cta/image',
      'cta/title',
      'cta/body',
      'cta/avatars',
      'cta/btn',
      'cta/composer/root',
      'cta/composer/input',
      'cta/composer/send_btn',
    ]) {
      expect(
        document.querySelector(`[data-component="${name}"]`),
        `missing ${name}`,
      ).toBeTruthy();
    }
  });
});
