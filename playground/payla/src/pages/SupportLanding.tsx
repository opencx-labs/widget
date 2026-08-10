// Customer-facing help-center landing — the SUPPORT-agent test surface.
// The widget here mounts WITHOUT agentId (see App.tsx): the session stays
// unbound and the org's default v3 support agent answers from the seeded KB.
// The merchant dashboard (every other route) remains the COMPANION test surface.

const TOPICS = [
  {
    title: "Payments",
    blurb: "Statuses, methods, failed payments, and what your customers see at checkout.",
  },
  {
    title: "Refunds",
    blurb: "How refunds work, how long they take, and what happens to your balance.",
  },
  {
    title: "Settlements & payouts",
    blurb: "When Payla pays out, settlement references, and reconciling your bank statement.",
  },
  {
    title: "Disputes & chargebacks",
    blurb: "Responding to a chargeback, evidence deadlines, and dispute fees.",
  },
  {
    title: "Payment links",
    blurb: "Creating and sharing payment links, expiry, and tracking who paid.",
  },
  {
    title: "Account & onboarding",
    blurb: "Verification, supported countries and currencies, and account settings.",
  },
];

export function SupportLanding() {
  return (
    <div className="min-h-screen bg-surface-2">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink text-[13px] font-bold text-white">
              P
            </span>
            <span className="text-[15px] font-semibold text-ink">Payla Help</span>
          </div>
          {/* Hard navigation on purpose: the widget script boots once per page
              load, and the dashboard mounts the COMPANION variant. */}
          <a href="/" className="text-[13px] text-link hover:underline">
            Go to dashboard →
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-16">
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">How can we help?</h1>
          <p className="mx-auto mt-3 max-w-xl text-[15px] text-ink-3">
            Browse a topic below, or ask Payla Support directly — the chat bubble in the corner
            answers from our help center and can look things up for you.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOPICS.map((topic) => (
            <div key={topic.title} className="rounded-xl border border-border bg-white p-5">
              <h2 className="text-[15px] font-semibold text-ink">{topic.title}</h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">{topic.blurb}</p>
            </div>
          ))}
        </div>

        <p className="mt-16 text-center text-[13px] text-ink-3">
          Can't find what you need? Start a chat — we'll hand you to a human when it matters.
        </p>
      </main>
    </div>
  );
}
