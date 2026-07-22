import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PaymentsTable } from "../components/PaymentsTable.tsx";
import { Card, CardHeader, KeyValue, Skeleton, StatusPill } from "../components/ui.tsx";
import { usePayments, useSettlement } from "../lib/queries.ts";
import { formatDateTime, formatMoney } from "../lib/format.ts";
import { settlementTone } from "../lib/status.ts";

export function SettlementDetail() {
  const { id } = useParams();
  const { data: settlement, isLoading } = useSettlement(id);
  const payments = usePayments({ limit: 200 });
  const settlementPayments = (payments.data?.data ?? []).filter((p) => p.settlementId === id);

  return (
    <div className="space-y-5">
      <Link to="/settlements" className="focusable inline-flex items-center gap-1.5 rounded-md text-[13px] text-ink-2 hover:text-ink">
        <ArrowLeft size={15} /> Settlements
      </Link>

      {isLoading || !settlement ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-[24px] font-semibold tracking-[-0.01em] text-ink">{formatMoney(settlement.amount)}</h2>
                <StatusPill tone={settlementTone(settlement.status)} label={settlement.status} />
              </div>
              <p className="mt-1 font-mono text-[13px] text-ink-3">{settlement.reference}</p>
            </div>
          </div>

          <Card>
            <CardHeader title="Details" />
            <dl className="divide-y divide-border px-5 py-1">
              <KeyValue label="Settlement ID">
                <span className="font-mono">{settlement.id}</span>
              </KeyValue>
              <KeyValue label="Reference">
                <span className="font-mono">{settlement.reference}</span>
              </KeyValue>
              <KeyValue label="Amount">{formatMoney(settlement.amount)}</KeyValue>
              <KeyValue label="Payments">{settlement.paymentsCount}</KeyValue>
              <KeyValue label="Created">{formatDateTime(settlement.createdAt)}</KeyValue>
              <KeyValue label="Settled">{formatDateTime(settlement.settledAt)}</KeyValue>
            </dl>
          </Card>

          {settlementPayments.length > 0 && (
            <Card>
              <CardHeader title={`Payments in this settlement (${settlementPayments.length})`} />
              <PaymentsTable payments={settlementPayments} loading={payments.isLoading} />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
