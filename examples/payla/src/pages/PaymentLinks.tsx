import { useState } from "react";
import { Link2, Plus } from "lucide-react";
import type { PaymentLink } from "../../shared/types.ts";
import { CreatePaymentLinkDialog } from "../components/CreatePaymentLinkDialog.tsx";
import { CopyButton } from "../components/CopyButton.tsx";
import { DataTable } from "../components/DataTable.tsx";
import type { Column } from "../components/DataTable.tsx";
import { Button, Card, EmptyState, StatusPill } from "../components/ui.tsx";
import { usePaymentLinks } from "../lib/queries.ts";
import { formatDate, formatMoney } from "../lib/format.ts";
import { paymentLinkTone } from "../lib/status.ts";

export function PaymentLinks() {
  const { data, isLoading } = usePaymentLinks(100);
  const [open, setOpen] = useState(false);

  const columns: Column<PaymentLink>[] = [
    {
      key: "description",
      header: "Description",
      render: (l) => (
        <div>
          <div className="font-medium text-ink">{l.description}</div>
          <div className="font-mono text-[12px] text-ink-3">{l.id}</div>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (l) => <StatusPill tone={paymentLinkTone(l.status)} label={l.status} /> },
    { key: "created", header: "Created", render: (l) => <span className="text-ink-2">{formatDate(l.createdAt)}</span> },
    {
      key: "url",
      header: "Link",
      render: (l) => (
        <div className="flex items-center gap-1">
          <span className="max-w-[180px] truncate font-mono text-[12px] text-ink-3">{l.url.replace(/^https?:\/\//, "")}</span>
          <CopyButton value={l.url} />
        </div>
      ),
    },
    { key: "amount", header: "Amount", align: "right", render: (l) => <span className="font-medium text-ink">{formatMoney(l.amount)}</span> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-ink-3">Charge customers without an integration — share a link, get paid.</p>
        <Button variant="primary" onClick={() => setOpen(true)}>
          <Plus size={15} /> New payment link
        </Button>
      </div>

      <Card>
        <DataTable
          columns={columns}
          rows={data?.data ?? []}
          keyOf={(l) => l.id}
          loading={isLoading}
          empty={<EmptyState icon={<Link2 size={22} />} title="No payment links yet">Create your first link to start charging customers.</EmptyState>}
        />
      </Card>

      <CreatePaymentLinkDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
