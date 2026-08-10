import { Link } from "react-router-dom";
import { ArrowRight, Wallet } from "lucide-react";
import { Card, CardHeader, Skeleton, StatusPill } from "../components/ui.tsx";
import { useBalance, useSettings, useSettlements } from "../lib/queries.ts";
import { formatDate, formatMoney, statusLabel } from "../lib/format.ts";
import { settlementTone } from "../lib/status.ts";

export function Balances() {
  const balance = useBalance();
  const settings = useSettings();
  const settlements = useSettlements(5);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="px-5 py-5">
          <div className="flex items-center gap-2 text-[13px] text-ink-3">
            <Wallet size={15} /> Available now
          </div>
          {balance.isLoading ? (
            <Skeleton className="mt-3 h-9 w-40" />
          ) : (
            <div className="mt-2 text-[30px] font-semibold tracking-[-0.02em] text-ink">
              {formatMoney(balance.data?.available)}
            </div>
          )}
          <p className="mt-1 text-[12px] text-ink-3">Ready to be paid out to your bank account.</p>
        </Card>

        <Card className="px-5 py-5">
          <div className="text-[13px] text-ink-3">On the way</div>
          {balance.isLoading ? (
            <Skeleton className="mt-3 h-9 w-40" />
          ) : (
            <div className="mt-2 text-[30px] font-semibold tracking-[-0.02em] text-ink">
              {formatMoney(balance.data?.pending)}
            </div>
          )}
          <p className="mt-1 text-[12px] text-ink-3">Recent payments still clearing before payout.</p>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <div className="text-sm font-semibold text-ink">Payout schedule</div>
            <p className="mt-0.5 text-[13px] text-ink-3">
              Payouts run{" "}
              <span className="font-medium text-ink">{statusLabel(settings.data?.payoutSchedule ?? "daily")}</span> to your
              linked bank account.
            </p>
          </div>
          <span className="rounded-full bg-surface-3 px-3 py-1 text-[12px] font-medium text-ink-2">
            {statusLabel(settings.data?.payoutSchedule ?? "daily")}
          </span>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Recent settlements"
          action={
            <Link to="/settlements" className="focusable inline-flex items-center gap-1 rounded-md text-[13px] font-medium text-link hover:underline">
              View all <ArrowRight size={14} />
            </Link>
          }
        />
        <div className="divide-y divide-border">
          {settlements.data?.data.map((s) => (
            <Link
              key={s.id}
              to={`/settlements/${s.id}`}
              className="focusable flex items-center justify-between px-5 py-3.5 hover:bg-surface-2"
            >
              <div>
                <div className="font-mono text-[13px] text-ink">{s.reference}</div>
                <div className="text-[12px] text-ink-3">{formatDate(s.createdAt)}</div>
              </div>
              <div className="flex items-center gap-3">
                <StatusPill tone={settlementTone(s.status)} label={s.status} />
                <span className="font-medium text-ink">{formatMoney(s.amount)}</span>
              </div>
            </Link>
          ))}
          {settlements.isLoading && <div className="px-5 py-4 text-[13px] text-ink-3">Loading…</div>}
        </div>
      </Card>
    </div>
  );
}
