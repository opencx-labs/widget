import { useState } from "react";
import { Bot, CircleCheck, CircleAlert } from "lucide-react";
import { Button, Card, CardHeader, Field, Input, KeyValue, Skeleton } from "../components/ui.tsx";
import { useSettings } from "../lib/queries.ts";
import { statusLabel } from "../lib/format.ts";
import { getWidgetConfig, isWidgetConfigured, saveWidgetConfig, clearWidgetConfig } from "../lib/widgetConfig.ts";

function AssistantCard() {
  const [cfg, setCfg] = useState(getWidgetConfig);
  const connected = isWidgetConfigured();

  const save = () => {
    saveWidgetConfig(cfg);
    window.location.reload(); // remount the widget with the new config
  };
  const reset = () => {
    clearWidgetConfig();
    window.location.reload();
  };

  return (
    <Card>
      <CardHeader title="AI assistant" />
      <div className="px-5 py-5">
        <div className="mb-5 flex items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
            <Bot size={18} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-ink">Payla Assistant</span>
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
              Powered by the OpenCX Companion. Paste the widget token + agent id from your OpenCX org
              (the seed script prints them) and point it at your backend. Saved in this browser — no redeploy.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <Field label="Widget token" hint="From your OpenCX org (x-bot-token).">
            <Input value={cfg.token} onChange={(e) => setCfg({ ...cfg, token: e.target.value })} placeholder="payla-companion-demo-token" />
          </Field>
          <Field label="Agent ID" hint="The agent-v3 agent to serve in the widget.">
            <Input value={cfg.agentId} onChange={(e) => setCfg({ ...cfg, agentId: e.target.value })} className="font-mono" />
          </Field>
          <Field label="OpenCX backend URL" hint="Where the widget talks to OpenCX. Local dev: http://localhost:8080.">
            <Input value={cfg.apiUrl} onChange={(e) => setCfg({ ...cfg, apiUrl: e.target.value })} placeholder="http://localhost:8080" />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Assistant name">
              <Input value={cfg.botName} onChange={(e) => setCfg({ ...cfg, botName: e.target.value })} />
            </Field>
            <Field label="Widget script URL" hint="Local build by default.">
              <Input value={cfg.scriptUrl} onChange={(e) => setCfg({ ...cfg, scriptUrl: e.target.value })} className="font-mono text-[12px]" />
            </Field>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={reset}>
              Reset to defaults
            </Button>
            <Button variant="primary" onClick={save}>
              Save &amp; reload
            </Button>
          </div>
        </div>
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
