import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.ts';

export const useMetrics = () =>
  useQuery({ queryKey: ['metrics'], queryFn: api.metrics });
export const useBalance = () =>
  useQuery({ queryKey: ['balance'], queryFn: api.balance });
export const useSettings = () =>
  useQuery({ queryKey: ['settings'], queryFn: api.settings });
// User tokens last an hour; refresh well before that.
const IDENTITY_REFRESH_MS = 50 * 60_000;
export const useWidgetIdentity = ({ enabled }: { enabled: boolean }) =>
  useQuery({
    queryKey: ['widget-identity'],
    queryFn: api.widgetIdentity,
    enabled,
    staleTime: IDENTITY_REFRESH_MS,
    refetchInterval: IDENTITY_REFRESH_MS,
  });

export const usePayments = (
  filters: {
    status?: string;
    method?: string;
    customer?: string;
    limit?: number;
  } = {},
) =>
  useQuery({
    queryKey: ['payments', filters],
    queryFn: () => api.payments(filters),
  });

const required = (id: string | undefined): string => {
  if (!id) throw new Error('Missing id');
  return id;
};

export const usePayment = (id: string | undefined) =>
  useQuery({
    queryKey: ['payment', id],
    queryFn: () => api.payment(required(id)),
    enabled: !!id,
  });

export const useCustomers = (limit?: number) =>
  useQuery({
    queryKey: ['customers', limit],
    queryFn: () => api.customers(limit),
  });

export const useCustomer = (id: string | undefined) =>
  useQuery({
    queryKey: ['customer', id],
    queryFn: () => api.customer(required(id)),
    enabled: !!id,
  });

export const usePaymentLinks = (limit?: number) =>
  useQuery({
    queryKey: ['payment-links', limit],
    queryFn: () => api.paymentLinks(limit),
  });

export const useSettlements = (limit?: number) =>
  useQuery({
    queryKey: ['settlements', limit],
    queryFn: () => api.settlements(limit),
  });

export const useSettlement = (id: string | undefined) =>
  useQuery({
    queryKey: ['settlement', id],
    queryFn: () => api.settlement(required(id)),
    enabled: !!id,
  });

export const useDisputes = (limit?: number) =>
  useQuery({
    queryKey: ['disputes', limit],
    queryFn: () => api.disputes(limit),
  });

export function useRefundPayment(paymentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { amount?: number; reason?: string }) =>
      api.refundPayment(paymentId, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['payment', paymentId] });
      void qc.invalidateQueries({ queryKey: ['payments'] });
      void qc.invalidateQueries({ queryKey: ['refunds'] });
      void qc.invalidateQueries({ queryKey: ['balance'] });
      void qc.invalidateQueries({ queryKey: ['metrics'] });
    },
  });
}

export function useCreatePaymentLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { amount: number; description: string }) =>
      api.createPaymentLink(body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['payment-links'] }),
  });
}
