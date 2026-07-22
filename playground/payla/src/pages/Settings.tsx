import { Bot, CircleCheck, CircleAlert } from "lucide-react";
import { Card, CardHeader, KeyValue, Skeleton } from "../components/ui.tsx";
import { useSettings } from "../lib/queries.ts";
import { statusLabel } from "../lib/format.ts";
import { getWidgetConfig, isWidgetConfigured } from "../lib/widgetConfig.ts";

function AssistantCard() {
  const cfg = getWidgetConfig();
  const connected = isWidgetConfigured();

  return (
    <Card>
      <CardHeader title="AI assistant" />
      <div className="px-5 py-5">
        <div className="flex items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
            <Bot size={18} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-ink">{cfg.botName}</span>
              {connected ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-0.5 text-[11px] font-medium text-success">
                  <CircleCheck size={12} /> Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-0.5 text-[11px] font-medium text-warning">
                  <CircleAlert size={12} /> Not configured
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[13px] text-ink-3">
              The OpenCX Companion, embedded from a local build and wired to your local OpenCX. Its
              token, agent and backend are baked into the app (see <code>src/lib/widgetConfig.ts</code>).
            </p>
          </div>
        </div>

        <dl className="mt-4 divide-y divide-border border-t border-border">
          <KeyValue label="Agent">
            <span className="font-mono">{cfg.agentId}</span>
          </KeyValue>
          <KeyValue label="Backend">
            <span className="font-mono">{cfg.apiUrl}</span>
          </KeyValue>
        </dl>
      </div>
    </Card>
  );
}

export function Settings() {
  const { data, isLoading } = useSettings();

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

      <AssistantCard />
    </div>
  );
}
