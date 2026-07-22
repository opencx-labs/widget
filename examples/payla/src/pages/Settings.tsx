import { Bot, CircleCheck, CircleAlert } from "lucide-react";
import { Card, CardHeader, KeyValue, Skeleton } from "../components/ui.tsx";
import { useSettings } from "../lib/queries.ts";
import { statusLabel } from "../lib/format.ts";

export function Settings() {
  const { data, isLoading } = useSettings();
  const widgetConfigured = Boolean(import.meta.env.VITE_OPENCX_WIDGET_TOKEN);

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader title="Account" />
        {isLoading || !data ? (
          <div className="px-5 py-4">
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <dl className="divide-y divide-border px-5 py-1">
            <KeyValue label="Business name">{data.merchantName}</KeyValue>
            <KeyValue label="Organization ID">
              <span className="font-mono">{data.merchantId}</span>
            </KeyValue>
            <KeyValue label="Email">{data.email}</KeyValue>
            <KeyValue label="Country">{data.country}</KeyValue>
            <KeyValue label="Statement descriptor">{data.statementDescriptor}</KeyValue>
            <KeyValue label="Payout schedule">{statusLabel(data.payoutSchedule)}</KeyValue>
            <KeyValue label="Mode">{data.testMode ? "Test" : "Live"}</KeyValue>
          </dl>
        )}
      </Card>

      <Card>
        <CardHeader title="AI assistant" />
        <div className="px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
              <Bot size={18} />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-ink">Payla Assistant</div>
              <p className="mt-0.5 text-[13px] text-ink-3">
                Powered by the OpenCX Companion. It can read your balance, payments, settlements and
                disputes, and take actions like issuing refunds or creating payment links — right from the
                chat bubble.
              </p>
              <div className="mt-3">
                {widgetConfigured ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-[12px] font-medium text-success">
                    <CircleCheck size={13} /> Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-[12px] font-medium text-warning">
                    <CircleAlert size={13} /> Not configured — set VITE_OPENCX_WIDGET_TOKEN
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
