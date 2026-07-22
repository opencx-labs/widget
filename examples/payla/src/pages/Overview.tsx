import { Link } from "react-router-dom";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { AreaChart } from "../components/AreaChart.tsx";
import { PaymentsTable } from "../components/PaymentsTable.tsx";
import { StatTile } from "../components/StatTile.tsx";
import { Card, CardHeader } from "../components/ui.tsx";
import { useBalance, useDisputes, useMetrics, usePayments, useSettings } from "../lib/queries.ts";
import { formatMoney, formatNumber, formatPercent, methodLabel } from "../lib/format.ts";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function Overview() {
  const { data: settings } = useSettings();
  const metrics = useMetrics();
  const balance = useBalance();
  const payments = usePayments({ limit: 6 });
  const disputes = useDisputes(50);

  const m = metrics.data;
  const prev = m ? Number(m.revenuePrev30d.value) : 0;
  const cur = m ? Number(m.revenue30d.value) : 0;
  const delta = prev > 0 ? ((cur - prev) / prev) * 100 : null;
  const openDisputes = disputes.data?.data.filter((d) => d.status === "open" || d.status === "under_review") ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[22px] font-semibold tracking-[-0.01em] text-ink">
          {greeting()}
          {settings?.merchantName ? `, ${settings.merchantName}` : ""}
        </h2>
        <p className="mt-0.5 text-[13px] text-ink-3">Here's how your store is doing over the last 30 days.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Available balance"
          value={formatMoney(balance.data?.available)}
          sub={balance.data ? `${formatMoney(balance.data.pending)} pending` : undefined}
          loading={balance.isLoading}
        />
        <StatTile
          label="Revenue · 30 days"
          value={formatMoney(m?.revenue30d)}
          delta={delta}
          sub="vs previous 30 days"
          loading={metrics.isLoading}
        />
        <StatTile
          label="Payments · 30 days"
          value={m ? formatNumber(m.paymentsCount30d) : "—"}
          sub={m ? `${formatMoney(m.avgOrderValue)} avg. order` : undefined}
          loading={metrics.isLoading}
        />
        <StatTile
          label="Success rate"
          value={m ? formatPercent(m.successRate) : "—"}
          sub="of decided payments"
          loading={metrics.isLoading}
        />
      </div>

      <Card>
        <CardHeader
          title="Revenue"
          action={<span className="text-sm font-semibold text-ink">{formatMoney(m?.revenue30d)}</span>}
        />
        <div className="px-3 py-4">
          {m && <AreaChart data={m.series} currency={m.revenue30d.currency} />}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Recent payments"
            action={
              <Link to="/payments" className="focusable inline-flex items-center gap-1 rounded-md text-[13px] font-medium text-link hover:underline">
                View all <ArrowRight size={14} />
              </Link>
            }
          />
          <PaymentsTable payments={payments.data?.data ?? []} loading={payments.isLoading} showCustomer={false} minWidth={460} />
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Payment methods" />
            <div className="space-y-3 px-5 py-4">
              {(m?.methodBreakdown ?? []).slice(0, 6).map((row) => {
                const total = m?.methodBreakdown.reduce((a, r) => a + Number(r.amount.value), 0) || 1;
                const pct = (Number(row.amount.value) / total) * 100;
                return (
                  <div key={row.method}>
                    <div className="mb-1 flex items-center justify-between text-[13px]">
                      <span className="text-ink-2">{methodLabel(row.method)}</span>
                      <span className="font-medium text-ink">{formatMoney(row.amount)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-4">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              {metrics.isLoading && <div className="text-[13px] text-ink-3">Loading…</div>}
            </div>
          </Card>

          {openDisputes.length > 0 && (
            <Link to="/disputes" className="focusable block">
              <Card className="border-danger/30 bg-danger-soft/40 transition-colors hover:bg-danger-soft/70">
                <div className="flex items-start gap-3 px-5 py-4">
                  <ShieldAlert size={20} className="mt-0.5 shrink-0 text-danger" />
                  <div>
                    <div className="text-sm font-semibold text-ink">
                      {openDisputes.length} open {openDisputes.length === 1 ? "dispute" : "disputes"}
                    </div>
                    <div className="mt-0.5 text-[13px] text-ink-2">
                      Respond before the deadline to avoid losing the chargeback.
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
