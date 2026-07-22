import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import type { PaymentLink } from "../../shared/types.ts";
import { Dialog } from "./Dialog.tsx";
import { Button, Field, Input } from "./ui.tsx";
import { CopyButton } from "./CopyButton.tsx";
import { useCreatePaymentLink } from "../lib/queries.ts";
import { ApiError } from "../lib/api.ts";

export function CreatePaymentLinkDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<PaymentLink | null>(null);
  const create = useCreatePaymentLink();

  const reset = () => {
    setDescription("");
    setAmount("");
    setError(null);
    setCreated(null);
  };
  const close = () => {
    onClose();
    setTimeout(reset, 200);
  };

  const submit = async () => {
    setError(null);
    const value = Number(amount);
    if (!description.trim()) return setError("Add a description.");
    if (!Number.isFinite(value) || value <= 0) return setError("Enter a valid amount.");
    try {
      const link = await create.mutateAsync({ amount: value, description: description.trim() });
      setCreated(link);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong.");
    }
  };

  return (
    <Dialog open={open} onClose={close} title={created ? "Payment link created" : "New payment link"}>
      {created ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-success">
            <CheckCircle2 size={18} />
            <span className="text-[13px] font-medium">Share this link to get paid.</span>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2.5">
            <span className="truncate font-mono text-[12px] text-ink">{created.url}</span>
            <CopyButton value={created.url} label="Copy" />
          </div>
          <div className="flex justify-end">
            <Button variant="primary" onClick={close}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Description">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Wholesale invoice — Café Nero"
              maxLength={200}
              autoFocus
            />
          </Field>
          <Field label="Amount">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">€</span>
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className="pl-7" />
            </div>
          </Field>
          {error && <p className="text-[13px] text-danger">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={close} disabled={create.isPending}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create link"}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
