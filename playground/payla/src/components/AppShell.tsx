import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  ArrowLeftRight,
  CreditCard,
  House,
  LifeBuoy,
  Link2,
  Menu,
  Settings as SettingsIcon,
  ShieldAlert,
  Users,
  Wallet,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../lib/cn.ts";
import { Logo } from "./Logo.tsx";
import { useSettings } from "../lib/queries.ts";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}
interface NavGroup {
  label?: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  { items: [{ to: "/", label: "Home", icon: House, end: true }] },
  {
    label: "Payments",
    items: [
      { to: "/payments", label: "Payments", icon: CreditCard },
      { to: "/payment-links", label: "Payment links", icon: Link2 },
      { to: "/customers", label: "Customers", icon: Users },
    ],
  },
  {
    label: "Finance",
    items: [
      { to: "/balances", label: "Balances", icon: Wallet },
      { to: "/settlements", label: "Settlements", icon: ArrowLeftRight },
      { to: "/disputes", label: "Disputes", icon: ShieldAlert },
    ],
  },
];

const TITLES: Record<string, string> = {
  "/": "Home",
  "/payments": "Payments",
  "/payment-links": "Payment links",
  "/customers": "Customers",
  "/balances": "Balances",
  "/settlements": "Settlements",
  "/disputes": "Disputes",
  "/settings": "Settings",
};

function NavRow({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "focusable flex items-center gap-2.5 rounded-lg px-2.5 h-8 text-[13.5px] transition-colors",
          isActive ? "bg-surface-3 text-ink font-medium" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
        )
      }
    >
      <Icon size={17} strokeWidth={1.9} className="shrink-0 text-ink-3" />
      {item.label}
    </NavLink>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { data: settings } = useSettings();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center px-4">
        <Logo />
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {NAV.map((group, gi) => (
          <div key={gi} className="space-y-0.5">
            {group.label && (
              <div className="px-2.5 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-ink-4">
                {group.label}
              </div>
            )}
            {group.items.map((item) => (
              <NavRow key={item.to} item={item} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>

      <div className="space-y-0.5 border-t border-border px-3 py-3">
        <NavRow item={{ to: "/settings", label: "Settings", icon: SettingsIcon }} onNavigate={onNavigate} />
        <a
          href="/help"
          onClick={(e) => e.preventDefault()}
          className="focusable flex items-center gap-2.5 rounded-lg px-2.5 h-8 text-[13.5px] text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          <LifeBuoy size={17} strokeWidth={1.9} className="shrink-0 text-ink-3" />
          Help
        </a>
      </div>

      <div className="flex items-center gap-2.5 border-t border-border px-4 py-3">
        <div className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-4 text-[12px] font-semibold text-ink-2">
          {(settings?.merchantName ?? "P").slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium text-ink">{settings?.merchantName ?? "Payla"}</div>
          <div className="truncate text-[11px] text-ink-3">{settings?.merchantId ?? "org_payla"}</div>
        </div>
      </div>
    </div>
  );
}

const DETAIL_TITLES: Record<string, string> = {
  payments: "Payment",
  customers: "Customer",
  settlements: "Settlement",
};

export function AppShell() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);
  const title =
    segments.length > 1 && DETAIL_TITLES[segments[0]]
      ? DETAIL_TITLES[segments[0]]
      : (TITLES[`/${segments[0] ?? ""}`] ?? "Payla");

  return (
    <div className="flex min-h-screen bg-bg text-ink">
      {/* Desktop sidebar */}
      <aside className="hidden w-[248px] shrink-0 border-r border-border md:block">
        <div className="sticky top-0 h-screen">
          <SidebarContent />
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-[280px] border-r border-border bg-surface">
            <button
              onClick={() => setOpen(false)}
              className="focusable absolute right-3 top-4 rounded-lg p-1 text-ink-3 hover:bg-surface-3"
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
            <SidebarContent onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-bg/85 px-4 backdrop-blur md:px-7">
          <button
            onClick={() => setOpen(true)}
            className="focusable -ml-1 rounded-lg p-1.5 text-ink-2 hover:bg-surface-3 md:hidden"
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>
          <h1 className="text-[15px] font-semibold text-ink">{title}</h1>
          <div className="ml-auto flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-[11px] font-medium text-warning">
              <span className="size-1.5 rounded-full bg-warning-dot" />
              Test data
            </span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-6 md:px-7 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
