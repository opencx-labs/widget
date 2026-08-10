import { useNavigate } from "react-router-dom";
import { Users } from "lucide-react";
import type { Customer } from "../../shared/types.ts";
import { DataTable } from "../components/DataTable.tsx";
import type { Column } from "../components/DataTable.tsx";
import { Card, EmptyState } from "../components/ui.tsx";
import { useCustomers } from "../lib/queries.ts";
import { formatDate, formatMoney, formatNumber } from "../lib/format.ts";

export function Customers() {
  const { data, isLoading } = useCustomers(100);
  const navigate = useNavigate();

  const columns: Column<Customer>[] = [
    {
      key: "name",
      header: "Customer",
      render: (c) => (
        <div className="flex items-center gap-3">
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-4 text-[12px] font-semibold text-ink-2">
            {c.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="font-medium text-ink">{c.name}</div>
            <div className="text-[12px] text-ink-3">{c.email}</div>
          </div>
        </div>
      ),
    },
    { key: "payments", header: "Payments", render: (c) => <span className="text-ink-2">{formatNumber(c.paymentsCount)}</span> },
    { key: "joined", header: "Joined", render: (c) => <span className="text-ink-2">{formatDate(c.createdAt)}</span> },
    { key: "spent", header: "Total spent", align: "right", render: (c) => <span className="font-medium text-ink">{formatMoney(c.totalSpent)}</span> },
  ];

  return (
    <Card>
      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        keyOf={(c) => c.id}
        loading={isLoading}
        onRowClick={(c) => navigate(`/customers/${c.id}`)}
        empty={<EmptyState icon={<Users size={22} />} title="No customers yet" />}
      />
    </Card>
  );
}
