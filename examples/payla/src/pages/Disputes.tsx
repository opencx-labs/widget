import { useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import type { Dispute } from "../../shared/types.ts";
import { DataTable } from "../components/DataTable.tsx";
import type { Column } from "../components/DataTable.tsx";
import { Card, EmptyState, StatusPill } from "../components/ui.tsx";
import { useDisputes } from "../lib/queries.ts";
import { formatDate, formatMoney, statusLabel } from "../lib/format.ts";
import { disputeTone } from "../lib/status.ts";

export function Disputes() {
  const { data, isLoading } = useDisputes(100);
  const navigate = useNavigate();

  const columns: Column<Dispute>[] = [
    {
      key: "id",
      header: "Dispute",
      render: (d) => (
        <div>
          <div className="font-mono font-medium text-ink">{d.id}</div>
          <div className="font-mono text-[12px] text-ink-3">{d.paymentId}</div>
        </div>
      ),
    },
    { key: "reason", header: "Reason", render: (d) => <span className="text-ink-2">{statusLabel(d.reason)}</span> },
    { key: "status", header: "Status", render: (d) => <StatusPill tone={disputeTone(d.status)} label={d.status} /> },
    { key: "due", header: "Respond by", render: (d) => <span className="text-ink-2">{formatDate(d.dueAt)}</span> },
    { key: "amount", header: "Amount", align: "right", render: (d) => <span className="font-medium text-ink">{formatMoney(d.amount)}</span> },
  ];

  return (
    <Card>
      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        keyOf={(d) => d.id}
        loading={isLoading}
        onRowClick={(d) => navigate(`/payments/${d.paymentId}`)}
        empty={<EmptyState icon={<ShieldCheck size={22} />} title="No disputes">You have no chargebacks or disputes. Nice.</EmptyState>}
      />
    </Card>
  );
}
