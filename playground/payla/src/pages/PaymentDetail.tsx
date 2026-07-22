import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { RefundDialog } from "../components/RefundDialog.tsx";
import { Button, Card, CardHeader, KeyValue, Skeleton, StatusPill } from "../components/ui.tsx";
import { usePayment } from "../lib/queries.ts";
import { formatDateTime, formatMoney, methodLabel } from "../lib/format.ts";
import { paymentTone, refundTone } from "../lib/status.ts";

export function PaymentDetail() {
  const { id } = useParams();
  const { data: payment, isLoading } = usePayment(id);
  const [refundOpen, setRefundOpen] = useState(false);

  const remaining = payment ? Number(payment.amount.value) - Number(payment.amountRefunded.value) : 0;
  const refundable = payment ? (payment.status === "paid" || payment.status === "partially_refunded") && remaining > 0 : false;

  return (
    <div className="space-y-5">
      <Link to="/payments" className="focusable inline-flex items-center gap-1.5 rounded-md text-[13px] text-ink-2 hover:text-ink">
        <ArrowLeft size={15} /> Payments
      </Link>

      {isLoading || !payment ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-[26px] font-semibold tracking-[-0.01em] text-ink">{formatMoney(payment.amount)}</h2>
                <StatusPill tone={paymentTone(payment.status)} label={payment.status} />
              </div>
              <p className="mt-1 font-mono text-[13px] text-ink-3">{payment.id}</p>
            </div>
            {refundable && (
              <Button variant="secondary" onClick={() => setRefundOpen(true)}>
                <RotateCcw size={15} /> Refund
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
              <Card>
                <CardHeader title="Details" />
                <dl className="divide-y divide-border px-5 py-1">
                  <KeyValue label="Description">{payment.description || "—"}</KeyValue>
                  <KeyValue label="Method">{methodLabel(payment.method)}</KeyValue>
                  <KeyValue label="Amount">{formatMoney(payment.amount)}</KeyValue>
                  <KeyValue label="Refunded">
                    {Number(payment.amountRefunded.value) > 0 ? `−${formatMoney(payment.amountRefunded)}` : "—"}
                  </KeyValue>
                  <KeyValue label="Created">{formatDateTime(payment.createdAt)}</KeyValue>
                  <KeyValue label="Paid">{formatDateTime(payment.paidAt)}</KeyValue>
                  <KeyValue label="Settlement">
                    {payment.settlementId ? (
                      <Link to={`/settlements/${payment.settlementId}`} className="font-mono text-link hover:underline">
                        {payment.settlementId}
                      </Link>
                    ) : (
                      "Not settled"
                    )}
                  </KeyValue>
                </dl>
              </Card>

              {payment.refunds.length > 0 && (
                <Card>
                  <CardHeader title={`Refunds (${payment.refunds.length})`} />
                  <div className="divide-y divide-border">
                    {payment.refunds.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <div className="min-w-0">
                          <div className="font-mono text-[12px] text-ink-3">{r.id}</div>
                          <div className="text-[13px] text-ink-2">{r.reason ?? "No reason given"}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <StatusPill tone={refundTone(r.status)} label={r.status} />
                          <span className="font-medium text-ink">−{formatMoney(r.amount)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>

            <div className="space-y-5">
              <Card>
                <CardHeader title="Customer" />
                <div className="px-5 py-4">
                  {payment.customerId ? (
                    <Link
                      to={`/customers/${payment.customerId}`}
                      className="focusable flex items-center gap-3 rounded-lg hover:opacity-80"
                    >
                      <div className="grid size-9 place-items-center rounded-full bg-surface-4 text-[13px] font-semibold text-ink-2">
                        {(payment.customerName ?? "?").slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-[13px] font-medium text-ink">{payment.customerName ?? "Customer"}</div>
                        <div className="font-mono text-[12px] text-link">{payment.customerId}</div>
                      </div>
                    </Link>
                  ) : (
                    <p className="text-[13px] text-ink-3">No customer linked to this payment.</p>
                  )}
                </div>
              </Card>
            </div>
          </div>

          <RefundDialog payment={payment} open={refundOpen} onClose={() => setRefundOpen(false)} />
        </>
      )}
    </div>
  );
}
