import { useQuery } from '@tanstack/react-query';
import { IPC_CHANNELS } from '../../../../core/ipc/channels';
import type { ProductVariant, Product } from '../types/billing.types';

export function useActiveRates() {
  return useQuery<ProductVariant[]>({
    queryKey: ['billing', 'variants'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.BILLING.GET_VARIANTS);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    refetchInterval: 15000,
    staleTime: 5000,
  });
}

export function useProducts() {
  return useQuery<Product[]>({
    queryKey: ['billing', 'products'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.BILLING.GET_PRODUCTS);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    staleTime: 60000,
  });
}
