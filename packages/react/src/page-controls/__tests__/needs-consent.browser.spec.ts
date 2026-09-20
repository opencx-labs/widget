// Which actions the visitor has to say yes to. Wrong in one direction costs
// a tap; wrong in the other costs whatever the button did, so this errs
// loudly towards asking.
import { afterEach, describe, expect, it } from 'vitest';
import { needsConsent } from '../needs-consent';

const el = (html: string): HTMLElement => {
  document.body.innerHTML = html;
  const found = document.querySelector<HTMLElement>('#t');
  if (!found) throw new Error('fixture needs #t');
  return found;
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('what has to be allowed first', () => {
  it.each([
    ['Pay now', '<button id="t">Pay now</button>'],
    ['Delete account', '<button id="t">Delete account</button>'],
    ['Cancel subscription', '<button id="t">Cancel subscription</button>'],
    ['Confirm order', '<button id="t">Confirm order</button>'],
    ['Submit', '<button id="t">Submit</button>'],
    ['Transfer funds', '<div id="t" role="button">Transfer funds</div>'],
    [
      'aria-labelled',
      '<button id="t" aria-label="Authorize payment"></button>',
    ],
  ])('asks before %s', (_name, html) => {
    expect(needsConsent(el(html), 'click')).toBe(true);
  });

  it('asks before any button that submits a form, whatever it is called', () => {
    expect(
      needsConsent(
        el('<form><button id="t">Continue</button></form>'),
        'click',
      ),
    ).toBe(true);
    expect(
      needsConsent(el('<input id="t" type="submit" value="Go" />'), 'click'),
    ).toBe(true);
    // Positive control: the same words outside a form do not.
    expect(needsConsent(el('<button id="t">Continue</button>'), 'click')).toBe(
      false,
    );
  });

  it('asks before switching something off that sounds committing', () => {
    expect(
      needsConsent(
        el(
          '<div id="t" role="switch" aria-checked="true">Cancel auto-renew</div>',
        ),
        'uncheck',
      ),
    ).toBe(true);
  });
});

describe('what does not need asking', () => {
  it('does not ask before ordinary navigation and disclosure', () => {
    for (const html of [
      '<button id="t">Show details</button>',
      '<a id="t" href="/billing">Billing</a>',
      '<button id="t">Next page</button>',
      '<div id="t" role="tab">Invoices</div>',
    ]) {
      expect(needsConsent(el(html), 'click'), html).toBe(false);
    }
  });

  it('does not ask for typing — the button afterwards gets its own chip', () => {
    expect(needsConsent(el('<input id="t" />'), 'fill')).toBe(false);
    expect(
      needsConsent(el('<select id="t"><option>a</option></select>'), 'select'),
    ).toBe(false);
    // Positive control: clicking the thing that commits it does ask.
    expect(needsConsent(el('<button id="t">Submit</button>'), 'click')).toBe(
      true,
    );
  });
});
