import { useState } from "react";
import type { Payment } from "../../shared/types.ts";
import { Dialog } from "./Dialog.tsx";
import { Button, Field, Input } from "./ui.tsx";
import { useRefundPayment } from "../lib/queries.ts";
import { ApiError } from "../lib/api.ts";
import { formatMoney } from "../lib/format.ts";

export function RefundDialog({ payment, open, onClose }: { payment: Payment; open: boolean; onClose: () => void }) {
  const remaining = Number(payment.amount.value) - Number(payment.amountRefunded.value);
  const [amount, setAmount] = useState(remaining.toFixed(2));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const refund = useRefundPayment(payment.id);

  const submit = async () => {
    setError(null);
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return setError("Enter a valid amount.");
    if (value > remaining + 1e-9) return setError(`Amount can't exceed the refundable ${remaining.toFixed(2)}.`);
    try {
      await refund.mutateAsync({ amount: value, reason: reason.trim() || undefined });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Refund payment">
      <div className="space-y-4">
        <div className="rounded-lg bg-surface-2 px-3 py-2.5 text-[13px]">
          <div className="flex justify-between">
            <span className="text-ink-3">Payment</span>
            <span className="font-mono text-ink">{payment.id}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-ink-3">Refundable</span>
            <span className="font-medium text-ink">
              {formatMoney({ value: remaining.toFixed(2), currency: payment.amount.currency })}
            </span>
          </div>
        </div>

        <Field label="Amount" hint="Refunds go back to the customer's original payment method.">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">€</span>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              className="pl-7"
              autoFocus
            />
          </div>
        </Field>

        <Field label="Reason (optional)">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer request" maxLength={200} />
        </Field>

        {error && <p className="text-[13px] text-danger">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={refund.isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={refund.isPending}>
            {refund.isPending ? "Refunding…" : `Refund ${formatMoney({ value: (Number(amount) || 0).toFixed(2), currency: payment.amount.currency })}`}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
