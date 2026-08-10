import { Link, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./components/AppShell.tsx";
import { CompanionWidget } from "./components/CompanionWidget.tsx";
import { Overview } from "./pages/Overview.tsx";
import { Payments } from "./pages/Payments.tsx";
import { PaymentDetail } from "./pages/PaymentDetail.tsx";
import { PaymentLinks } from "./pages/PaymentLinks.tsx";
import { Customers } from "./pages/Customers.tsx";
import { CustomerDetail } from "./pages/CustomerDetail.tsx";
import { Balances } from "./pages/Balances.tsx";
import { Settlements } from "./pages/Settlements.tsx";
import { SettlementDetail } from "./pages/SettlementDetail.tsx";
import { Disputes } from "./pages/Disputes.tsx";
import { Settings } from "./pages/Settings.tsx";
import { SupportLanding } from "./pages/SupportLanding.tsx";

function NotFound() {
  return (
    <div className="py-24 text-center">
      <p className="text-sm font-medium text-ink">Page not found</p>
      <Link to="/" className="mt-2 inline-block text-[13px] text-link hover:underline">
        Back to home
      </Link>
    </div>
  );
}

export function App() {
  // /support is the customer-facing SUPPORT-agent surface (widget unbound →
  // org default v3 agent); everything else is the merchant dashboard with the
  // COMPANION agent. The widget boots once per page load, so cross-surface
  // links are hard <a> navigations.
  const isSupport = useLocation().pathname.startsWith("/support");
  return (
    <>
      <Routes>
        <Route path="/support" element={<SupportLanding />} />
        <Route element={<AppShell />}>
          <Route path="/" element={<Overview />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/payments/:id" element={<PaymentDetail />} />
          <Route path="/payment-links" element={<PaymentLinks />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/customers/:id" element={<CustomerDetail />} />
          <Route path="/balances" element={<Balances />} />
          <Route path="/settlements" element={<Settlements />} />
          <Route path="/settlements/:id" element={<SettlementDetail />} />
          <Route path="/disputes" element={<Disputes />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      <CompanionWidget variant={isSupport ? "support" : "companion"} />
    </>
  );
}
