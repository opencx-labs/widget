import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Mail } from "lucide-react";
import { PaymentsTable } from "../components/PaymentsTable.tsx";
import { Card, CardHeader, KeyValue, Skeleton } from "../components/ui.tsx";
import { StatTile } from "../components/StatTile.tsx";
import { useCustomer } from "../lib/queries.ts";
import { formatDate, formatMoney, formatNumber } from "../lib/format.ts";

export function CustomerDetail() {
  const { id } = useParams();
  const { data: customer, isLoading } = useCustomer(id);

  return (
    <div className="space-y-5">
      <Link to="/customers" className="focusable inline-flex items-center gap-1.5 rounded-md text-[13px] text-ink-2 hover:text-ink">
        <ArrowLeft size={15} /> Customers
      </Link>

      {isLoading || !customer ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <div className="flex items-center gap-4">
            <div className="grid size-14 shrink-0 place-items-center rounded-full bg-surface-4 text-lg font-semibold text-ink-2">
              {customer.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h2 className="text-[22px] font-semibold tracking-[-0.01em] text-ink">{customer.name}</h2>
              <a href={`mailto:${customer.email}`} className="mt-0.5 inline-flex items-center gap-1.5 text-[13px] text-link hover:underline">
                <Mail size={13} /> {customer.email}
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <StatTile label="Total spent" value={formatMoney(customer.totalSpent)} />
            <StatTile label="Payments" value={formatNumber(customer.paymentsCount)} />
            <StatTile label="Customer since" value={formatDate(customer.createdAt)} />
          </div>

          <Card>
            <CardHeader title="Payments" />
            <PaymentsTable payments={customer.payments} showCustomer={false} emptyLabel="No payments from this customer" />
          </Card>

          <Card>
            <CardHeader title="Details" />
            <dl className="divide-y divide-border px-5 py-1">
              <KeyValue label="Customer ID">
                <span className="font-mono">{customer.id}</span>
              </KeyValue>
              <KeyValue label="Locale">{customer.locale}</KeyValue>
              <KeyValue label="Email">{customer.email}</KeyValue>
            </dl>
          </Card>
        </>
      )}
    </div>
  );
}
