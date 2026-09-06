// What a merchant can @-mention in the companion, and what the page they are
// on "is" — both resolved from the demo's own API, in the widget's entity
// shape ({ type, id, title }). The agent gets the same vocabulary the
// merchant sees on screen.
import { api } from './api.ts';
import { formatMoney } from './format.ts';

type Mention = {
  type: string;
  id: string;
  title: string;
  description?: string;
  iconName?: 'CreditCard' | 'User' | 'Ticket' | 'Package';
};

/** Async search across payments and customers, best matches first. */
export async function searchMentions(query: string): Promise<Mention[]> {
  const needle = query.trim().toLowerCase();
  const [payments, customers] = await Promise.all([
    api.payments({ limit: 50 }),
    api.customers(50),
  ]);
  const matches = (...fields: Array<string | null | undefined>) =>
    !needle || fields.some((f) => f?.toLowerCase().includes(needle));

  const paymentItems: Mention[] = payments.data
    .filter((p) => matches(p.id, p.description, p.customerName))
    .map((p) => ({
      type: 'payment',
      id: p.id,
      title: `${p.description} · ${formatMoney(p.amount)}`,
      description: `${p.id} · ${p.status}${p.customerName ? ` · ${p.customerName}` : ''}`,
      iconName: 'CreditCard',
    }));
  const customerItems: Mention[] = customers.data
    .filter((c) => matches(c.id, c.name, c.email))
    .map((c) => ({
      type: 'customer',
      id: c.id,
      title: c.name,
      description: `${c.email} · ${c.paymentsCount} payments`,
      iconName: 'User',
    }));
  return [...customerItems, ...paymentItems].slice(0, 8);
}

/** The entity the current route shows, for the composer's context pill. */
export function currentEntity(pathname: string): Mention | undefined {
  const [, section, id] = pathname.split('/');
  if (!id) return undefined;
  if (section === 'payments') return { type: 'payment', id, title: `Payment ${id}` };
  if (section === 'customers') return { type: 'customer', id, title: `Customer ${id}` };
  if (section === 'settlements') return { type: 'settlement', id, title: `Settlement ${id}` };
  return undefined;
}
