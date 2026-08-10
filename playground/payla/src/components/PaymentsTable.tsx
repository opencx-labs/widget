import { useNavigate } from "react-router-dom";
import { Receipt } from "lucide-react";
import type { Payment } from "../../shared/types.ts";
import { DataTable } from "./DataTable.tsx";
import type { Column } from "./DataTable.tsx";
import { EmptyState, StatusPill } from "./ui.tsx";
import { formatMoney, formatRelative, methodLabel } from "../lib/format.ts";
import { paymentTone } from "../lib/status.ts";

export function PaymentsTable({
  payments,
  loading,
  showCustomer = true,
  emptyLabel = "No payments yet",
  minWidth,
}: {
  payments: Payment[];
  loading?: boolean;
  showCustomer?: boolean;
  emptyLabel?: string;
  minWidth?: number;
}) {
  const navigate = useNavigate();

  const columns: Column<Payment>[] = [
    {
      key: "description",
      header: "Payment",
      render: (p) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-ink">{p.description || "—"}</div>
          <div className="font-mono text-[12px] text-ink-3">{p.id}</div>
        </div>
      ),
    },
    ...(showCustomer
      ? [
          {
            key: "customer",
            header: "Customer",
            render: (p: Payment) => <span className="text-ink-2">{p.customerName ?? "—"}</span>,
          } satisfies Column<Payment>,
        ]
      : []),
    {
      key: "method",
      header: "Method",
      render: (p) => <span className="text-ink-2">{methodLabel(p.method)}</span>,
    },
    {
      key: "date",
      header: "Date",
      render: (p) => <span className="whitespace-nowrap text-ink-2">{formatRelative(p.paidAt ?? p.createdAt)}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (p) => <StatusPill tone={paymentTone(p.status)} label={p.status} />,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (p) => (
        <div className="whitespace-nowrap">
          <span className="font-medium text-ink">{formatMoney(p.amount)}</span>
          {Number(p.amountRefunded.value) > 0 && (
            <div className="text-[12px] text-ink-3">−{formatMoney(p.amountRefunded)} refunded</div>
          )}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={payments}
      keyOf={(p) => p.id}
      loading={loading}
      minWidth={minWidth}
      onRowClick={(p) => navigate(`/payments/${p.id}`)}
      empty={<EmptyState icon={<Receipt size={22} />} title={emptyLabel} />}
    />
  );
}
