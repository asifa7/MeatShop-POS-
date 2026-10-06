// useDelivery.ts
// React Query hooks for MeatPOS Delivery Module

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { IPC_CHANNELS } from '../../../../core/ipc/channels';
import {
  DeliveryOrder,
  CreateDeliveryInput,
  DeliveryDriver,
  DeliveryZone,
  CustomerAddress,
  DeliveryStats,
  DeliveryFilterState,
  DeliveryException,
  DeliveryStatus,
  DeliveryAttempt,
  DeliveryCODReconciliation,
} from '../../types/delivery.types';

export function useDeliveries(filters: DeliveryFilterState = {}) {
  return useQuery<DeliveryOrder[]>({
    queryKey: ['deliveries', filters],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.DELIVERY.LIST, filters);
      if (!res.success) throw new Error(res.error?.message || 'Failed to fetch deliveries');
      return res.data || [];
    },
    refetchInterval: 10000,
  });
}

export function useDelivery(id: number | null) {
  return useQuery<DeliveryOrder | undefined>({
    queryKey: ['delivery', id],
    queryFn: async () => {
      if (!id) return undefined;
      const res = await window.api.invoke(IPC_CHANNELS.DELIVERY.GET_BY_ID, { id });
      if (!res.success) throw new Error(res.error?.message || 'Failed to fetch delivery details');
      return res.data;
    },
    enabled: Boolean(id),
  });
}

export function useActiveMapDeliveries() {
  return useQuery<DeliveryOrder[]>({
    queryKey: ['active-map-deliveries'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.DELIVERY.GET_ACTIVE_MAP, {});
      if (!res.success) throw new Error(res.error?.message || 'Failed to fetch map deliveries');
      return res.data || [];
    },
    refetchInterval: 10000,
  });
}

export function useDeliveryStats(startDate?: string, endDate?: string) {
  return useQuery<DeliveryStats>({
    queryKey: ['delivery-stats', startDate, endDate],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.DELIVERY.GET_STATS, { startDate, endDate });
      if (!res.success) throw new Error(res.error?.message || 'Failed to fetch delivery stats');
      return res.data;
    },
    refetchInterval: 15000,
  });
}

export function useDeliveryExceptions() {
  return useQuery<DeliveryException[]>({
    queryKey: ['delivery-exceptions'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.DELIVERY.GET_EXCEPTIONS, {});
      if (!res.success) return [];
      return res.data || [];
    },
    refetchInterval: 15000,
  });
}

export function useDeliveryDrivers() {
  return useQuery<DeliveryDriver[]>({
    queryKey: ['delivery-drivers'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.DELIVERY.GET_DRIVERS, {});
      if (!res.success) throw new Error(res.error?.message || 'Failed to fetch drivers');
      return res.data || [];
    },
  });
}

export function useDeliveryZones() {
  return useQuery<DeliveryZone[]>({
    queryKey: ['delivery-zones'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.DELIVERY.GET_ZONES, {});
      if (!res.success) throw new Error(res.error?.message || 'Failed to fetch zones');
      return res.data || [];
    },
  });
}

export function useCustomerAddresses(customerId?: number | null) {
  return useQuery<CustomerAddress[]>({
    queryKey: ['customer-addresses', customerId],
    queryFn: async () => {
      if (!customerId) return [];
      const res = await window.api.invoke(IPC_CHANNELS.DELIVERY.GET_CUSTOMER_ADDRESSES, { customerId });
      if (!res.success) return [];
      return res.data || [];
    },
    enabled: Boolean(customerId),
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export function useCreateDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateDeliveryInput) => {
      const res = await window.api.invoke(IPC_CHANNELS.DELIVERY.CREATE, input);
      if (!res.success) throw new Error(res.error?.message || 'Failed to create delivery');
      return res.data as DeliveryOrder;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deliveries'] });
      qc.invalidateQueries({ queryKey: ['active-map-deliveries'] });
      qc.invalidateQueries({ queryKey: ['delivery-stats'] });
      qc.invalidateQueries({ queryKey: ['delivery-exceptions'] });
    },
  });
}

export function useUpdateDeliveryStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: number; status: DeliveryStatus; reason?: string; notes?: string }) => {
      const res = await window.api.invoke(IPC_CHANNELS.DELIVERY.UPDATE_STATUS, params);
      if (!res.success) throw new Error(res.error?.message || 'Failed to update delivery status');
      return res.data as DeliveryOrder;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deliveries'] });
      qc.invalidateQueries({ queryKey: ['active-map-deliveries'] });
      qc.invalidateQueries({ queryKey: ['delivery-stats'] });
      qc.invalidateQueries({ queryKey: ['delivery-exceptions'] });
      qc.invalidateQueries({ queryKey: ['delivery-drivers'] });
    },
  });
}

export function useAssignDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { deliveryId: number; driverId: number }) => {
      const res = await window.api.invoke(IPC_CHANNELS.DELIVERY.ASSIGN_DRIVER, params);
      if (!res.success) throw new Error(res.error?.message || 'Failed to assign driver');
      return res.data as DeliveryOrder;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deliveries'] });
      qc.invalidateQueries({ queryKey: ['active-map-deliveries'] });
      qc.invalidateQueries({ queryKey: ['delivery-drivers'] });
      qc.invalidateQueries({ queryKey: ['delivery-stats'] });
    },
  });
}

export function useRecordDeliveryAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { deliveryId: number; attempt: Partial<DeliveryAttempt> }) => {
      const res = await window.api.invoke(IPC_CHANNELS.DELIVERY.RECORD_ATTEMPT, params);
      if (!res.success) throw new Error(res.error?.message || 'Failed to record attempt');
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deliveries'] });
      qc.invalidateQueries({ queryKey: ['delivery-stats'] });
      qc.invalidateQueries({ queryKey: ['delivery-exceptions'] });
    },
  });
}

export function useVerifyDeliveryOTP() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { deliveryId: number; otp: string }) => {
      const res = await window.api.invoke(IPC_CHANNELS.DELIVERY.VERIFY_OTP, params);
      if (!res.success) throw new Error(res.error?.message || 'Failed to verify OTP');
      return res.data as { success: boolean; message: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deliveries'] });
      qc.invalidateQueries({ queryKey: ['active-map-deliveries'] });
      qc.invalidateQueries({ queryKey: ['delivery-stats'] });
    },
  });
}

export function useRecordCOD() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { deliveryId: number; collectedPaise: number }) => {
      const res = await window.api.invoke(IPC_CHANNELS.DELIVERY.RECORD_COD, params);
      if (!res.success) throw new Error(res.error?.message || 'Failed to record COD');
      return res.data as DeliveryOrder;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deliveries'] });
      qc.invalidateQueries({ queryKey: ['delivery-stats'] });
      qc.invalidateQueries({ queryKey: ['delivery-exceptions'] });
    },
  });
}

export function useMarkPaymentReceived() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { deliveryId: number; isPaid?: boolean }) => {
      const res = await window.api.invoke(IPC_CHANNELS.DELIVERY.MARK_PAYMENT_RECEIVED, params);
      if (!res.success) throw new Error(res.error?.message || 'Failed to update payment status');
      return res.data as DeliveryOrder;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deliveries'] });
      qc.invalidateQueries({ queryKey: ['delivery-stats'] });
      qc.invalidateQueries({ queryKey: ['delivery-exceptions'] });
    },
  });
}

export function useMarkDelivered() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { deliveryId: number; isDelivered?: boolean }) => {
      const res = await window.api.invoke(IPC_CHANNELS.DELIVERY.MARK_DELIVERED, params);
      if (!res.success) throw new Error(res.error?.message || 'Failed to update delivery status');
      return res.data as DeliveryOrder;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deliveries'] });
      qc.invalidateQueries({ queryKey: ['delivery-stats'] });
      qc.invalidateQueries({ queryKey: ['delivery-exceptions'] });
    },
  });
}

export function useReconcileDriverCOD() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { driverId: number; shiftId?: number | null; notes?: string }) => {
      const res = await window.api.invoke(IPC_CHANNELS.DELIVERY.RECONCILE_COD, params);
      if (!res.success) throw new Error(res.error?.message || 'Failed to reconcile driver COD');
      return res.data as DeliveryCODReconciliation;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deliveries'] });
      qc.invalidateQueries({ queryKey: ['delivery-stats'] });
    },
  });
}

export function useSaveDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id?: number; input: Partial<DeliveryDriver> }) => {
      if (params.id) {
        const res = await window.api.invoke(IPC_CHANNELS.DELIVERY.UPDATE_DRIVER, { id: params.id, updates: params.input });
        if (!res.success) throw new Error(res.error?.message || 'Failed to update driver');
        return res.data;
      } else {
        const res = await window.api.invoke(IPC_CHANNELS.DELIVERY.CREATE_DRIVER, params.input);
        if (!res.success) throw new Error(res.error?.message || 'Failed to create driver');
        return res.data;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['delivery-drivers'] });
    },
  });
}

export function useSaveZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id?: number; input: Partial<DeliveryZone> }) => {
      if (params.id) {
        const res = await window.api.invoke(IPC_CHANNELS.DELIVERY.UPDATE_ZONE, { id: params.id, updates: params.input });
        if (!res.success) throw new Error(res.error?.message || 'Failed to update zone');
        return res.data;
      } else {
        const res = await window.api.invoke(IPC_CHANNELS.DELIVERY.CREATE_ZONE, params.input);
        if (!res.success) throw new Error(res.error?.message || 'Failed to create zone');
        return res.data;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['delivery-zones'] });
    },
  });
}

export function useSaveCustomerAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id?: number; input: Partial<CustomerAddress> & { customer_id: number; area: string; pincode: string } }) => {
      if (params.id) {
        const res = await window.api.invoke(IPC_CHANNELS.DELIVERY.UPDATE_ADDRESS, { id: params.id, updates: params.input });
        if (!res.success) throw new Error(res.error?.message || 'Failed to update address');
        return res.data;
      } else {
        const res = await window.api.invoke(IPC_CHANNELS.DELIVERY.CREATE_ADDRESS, params.input);
        if (!res.success) throw new Error(res.error?.message || 'Failed to create address');
        return res.data;
      }
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['customer-addresses', variables.input.customer_id] });
    },
  });
}
