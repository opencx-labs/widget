import { useNavigate } from "react-router-dom";
import { ArrowLeftRight } from "lucide-react";
import type { Settlement } from "../../shared/types.ts";
import { DataTable } from "../components/DataTable.tsx";
import type { Column } from "../components/DataTable.tsx";
import { Card, EmptyState, StatusPill } from "../components/ui.tsx";
import { useSettlements } from "../lib/queries.ts";
import { formatDate, formatMoney, formatNumber } from "../lib/format.ts";
import { settlementTone } from "../lib/status.ts";

export function Settlements() {
  const { data, isLoading } = useSettlements(100);
  const navigate = useNavigate();

  const columns: Column<Settlement>[] = [
    {
      key: "reference",
      header: "Reference",
      render: (s) => (
        <div>
          <div className="font-mono font-medium text-ink">{s.reference}</div>
          <div className="font-mono text-[12px] text-ink-3">{s.id}</div>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (s) => <StatusPill tone={settlementTone(s.status)} label={s.status} /> },
    { key: "payments", header: "Payments", render: (s) => <span className="text-ink-2">{formatNumber(s.paymentsCount)}</span> },
    { key: "settled", header: "Settled", render: (s) => <span className="text-ink-2">{formatDate(s.settledAt)}</span> },
    { key: "amount", header: "Amount", align: "right", render: (s) => <span className="font-medium text-ink">{formatMoney(s.amount)}</span> },
  ];

  return (
    <Card>
      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        keyOf={(s) => s.id}
        loading={isLoading}
        onRowClick={(s) => navigate(`/settlements/${s.id}`)}
        empty={<EmptyState icon={<ArrowLeftRight size={22} />} title="No settlements yet" />}
      />
    </Card>
  );
}
