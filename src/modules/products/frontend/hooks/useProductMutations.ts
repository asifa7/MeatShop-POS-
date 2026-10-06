import { useMutation, useQueryClient } from '@tanstack/react-query';
import { IPC_CHANNELS } from '../../../../core/ipc/channels';

function useInvalidateAll() {
  const queryClient = useQueryClient();
  return () => {
    // Exact keys verified against useActiveRates.ts, useProducts.ts, and useInventory.ts
    queryClient.invalidateQueries({ queryKey: ['billing', 'variants'] });
    queryClient.invalidateQueries({ queryKey: ['billing', 'products'] });
    queryClient.invalidateQueries({ queryKey: ['inventory'] }); // catches stock, low-stock, transactions, adjustments
    queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'rate-history'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'product-rate-history'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
  };
}

export function useCreateProduct() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      category: string;
      unit_type: 'weight' | 'piece' | 'live_dual' | string;
      type?: string;
      is_processed_cut?: number;
      product_code?: string;
      rate_paise: number;
      cost_price_paise?: number;
      track_in_inventory?: number;
    }) => {
      const res = await window.api.invoke(IPC_CHANNELS.PRODUCTS.CREATE, input);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateProduct() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (input: {
      id: number;
      fields: {
        name?: string;
        category?: string;
        unit_type?: 'weight' | 'piece' | 'live_dual' | string;
        type?: string;
        is_processed_cut?: number;
        product_code?: string;
        rate_paise?: number;
        cost_price_paise?: number;
        track_in_inventory?: number;
      };
    }) => {
      const res = await window.api.invoke(IPC_CHANNELS.PRODUCTS.UPDATE, input);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: invalidate,
  });
}

export function useBulkAddProducts() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (rows: Array<{
      name: string;
      category: string;
      type?: string;
      unit_type: string;
      product_code?: string;
      price_rupees: number;
      cost_rupees?: number;
      track_in_inventory?: number;
    }>) => {
      const res = await window.api.invoke(IPC_CHANNELS.PRODUCTS.BULK_IMPORT, { rows });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: invalidate,
  });
}


export function useDeactivateProduct() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await window.api.invoke(IPC_CHANNELS.PRODUCTS.DEACTIVATE, { id });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: invalidate,
  });
}

export function useReactivateProduct() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await window.api.invoke(IPC_CHANNELS.PRODUCTS.REACTIVATE, { id });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteProduct() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await window.api.invoke(IPC_CHANNELS.PRODUCTS.DELETE, { id });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: invalidate,
  });
}

export function useDeactivateCategory() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (category: string) => {
      const res = await window.api.invoke(IPC_CHANNELS.PRODUCTS.DEACTIVATE_CATEGORY, { category });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: invalidate,
  });
}

export function useReactivateCategory() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (category: string) => {
      const res = await window.api.invoke(IPC_CHANNELS.PRODUCTS.REACTIVATE_CATEGORY, { category });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteCategory() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (category: string) => {
      const res = await window.api.invoke(IPC_CHANNELS.PRODUCTS.DELETE_CATEGORY, { category });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: invalidate,
  });
}

export function useRestoreDeletedProduct() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (archiveId: number) => {
      const res = await window.api.invoke(IPC_CHANNELS.PRODUCTS.RESTORE_DELETED, { archiveId });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: invalidate,
  });
}

export function useCreateVariant() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (input: { product_id: number; variant_name: string; rate_paise: number; cost_price_paise?: number; barcode?: string | null }) => {
      const res = await window.api.invoke(IPC_CHANNELS.PRODUCTS.CREATE_VARIANT, input);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateVariantName() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (input: { variant_id: number; variant_name: string }) => {
      const res = await window.api.invoke(IPC_CHANNELS.PRODUCTS.UPDATE_VARIANT_NAME, input);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: invalidate,
  });
}

export function useDeactivateVariant() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await window.api.invoke(IPC_CHANNELS.PRODUCTS.DEACTIVATE_VARIANT, { id });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: invalidate,
  });
}

export function useReactivateVariant() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await window.api.invoke(IPC_CHANNELS.PRODUCTS.REACTIVATE_VARIANT, { id });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteVariant() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await window.api.invoke(IPC_CHANNELS.PRODUCTS.DELETE_VARIANT, { id });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateVariantRate() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (input: { variant_id: number; new_rate_paise: number; set_by?: number }) => {
      const res = await window.api.invoke(IPC_CHANNELS.PRODUCTS.UPDATE_RATE, { ...input, set_by: input.set_by ?? 1 });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: (_data, variables) => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['admin', 'rate-history', variables.variant_id] });
    },
  });
}

export function useUpdateVariantYield() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (input: { variant_id: number; parent_variant_id: number | null; yield_ratio: number | null }) => {
      const res = await window.api.invoke(IPC_CHANNELS.PRODUCTS.UPDATE_VARIANT_YIELD, input);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: invalidate,
  });
}
