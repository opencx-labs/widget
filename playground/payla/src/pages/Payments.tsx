import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { PAYMENT_METHODS, PAYMENT_STATUSES } from "../../shared/types.ts";
import { PaymentsTable } from "../components/PaymentsTable.tsx";
import { Card } from "../components/ui.tsx";
import { Input, Select } from "../components/ui.tsx";
import { usePayments } from "../lib/queries.ts";
import { methodLabel, statusLabel } from "../lib/format.ts";

export function Payments() {
  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const [q, setQ] = useState("");
  const { data, isLoading } = usePayments({ status: status || undefined, method: method || undefined, limit: 200 });

  const rows = useMemo(() => {
    const all = data?.data ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (p) =>
        p.id.toLowerCase().includes(needle) ||
        p.description.toLowerCase().includes(needle) ||
        (p.customerName ?? "").toLowerCase().includes(needle),
    );
  }, [data, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by id, description or customer…"
            className="pl-9"
          />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {PAYMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </Select>
        <Select value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="">All methods</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {methodLabel(m)}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        <PaymentsTable payments={rows} loading={isLoading} emptyLabel="No payments match your filters" />
      </Card>

      {!isLoading && (
        <p className="px-1 text-[12px] text-ink-3">
          Showing {rows.length} {rows.length === 1 ? "payment" : "payments"}
          {data && data.meta.total > rows.length && !q ? ` of ${data.meta.total}` : ""}
        </p>
      )}
    </div>
  );
}
