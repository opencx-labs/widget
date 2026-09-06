# Account verification, fees and API keys

## Verification

Before you can accept live payments, Payla verifies your business (company
details, the people behind it, and a bank account for payouts). Until that's
complete your account stays in **test mode** and live payments are disabled.

If you see "your payment services have been disabled", verification is incomplete
or extra information is needed — check the Home page for the outstanding steps.

## Fees

Payla charges a small fee per successful payment, which varies by method
(bank-based methods like iDEAL are typically cheaper than cards). Fees are
deducted automatically, so your settlement is always the **net** amount. Failed,
expired and refunded payments are not charged a processing fee (though the
original fee on a refunded payment is not returned).

## Test mode and API keys

- **Test mode** lets you simulate payments end-to-end without moving real money.
- Your **API keys** (test and live) live under developer settings and let you
  integrate Payla into your website or app.
- Never share your live API key. If it leaks, roll it immediately.

## Statement descriptor

The **statement descriptor** is the text customers see on their bank statement.
Keep it recognisable (your business name) to reduce confusion and disputes.
