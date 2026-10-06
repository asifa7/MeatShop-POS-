// delivery.types.ts
// Domain and frontend types for MeatPOS Delivery Module

export type DeliveryStatus =
  | 'order_created'
  | 'pending'
  | 'preparing'
  | 'ready_for_dispatch'
  | 'assigned'
  | 'picked_up'
  | 'out_for_delivery'
  | 'arrived'
  | 'delivered'
  | 'failed'
  | 'rescheduled'
  | 'cancelled'
  | 'returned';

export type DeliveryType = 'immediate' | 'scheduled' | 'same_day' | 'pickup' | 'home' | 'business';
export type DeliveryPriority = 'normal' | 'high' | 'urgent';
export type DriverVehicleType = 'two_wheeler' | 'three_wheeler' | 'car' | 'bicycle';
export type DriverStatus = 'available' | 'assigned' | 'picking_up' | 'delivering' | 'on_break' | 'offline';
export type AttemptResult = 'success' | 'failed' | 'rescheduled' | 'customer_unavailable' | 'rejected' | 'wrong_address';
export type PaymentStatusType = 'unpaid' | 'partial' | 'paid' | 'cod_pending' | 'refunded';

export interface CustomerAddress {
  id: number;
  customer_id: number;
  label: string; // Home, Office, Other
  door_no?: string | null;
  building?: string | null;
  street?: string | null;
  area: string;
  landmark?: string | null;
  city: string;
  district?: string | null;
  state: string;
  pincode: string;
  latitude?: number | null;
  longitude?: number | null;
  delivery_instructions?: string | null;
  is_default: number; // 0 or 1
  created_at?: string;
  updated_at?: string;
}

export interface DeliveryZone {
  id: number;
  name: string;
  code: string;
  description?: string | null;
  delivery_charge_paise: number;
  min_order_paise: number;
  free_delivery_above_paise?: number | null;
  estimated_minutes: number;
  available_from?: string | null;
  available_to?: string | null;
  is_active: number;
  is_default: number;
  created_at?: string;
}

export interface DeliveryDriver {
  id: number;
  employee_id?: number | null;
  name: string;
  phone: string;
  alternate_phone?: string | null;
  vehicle_type: DriverVehicleType;
  vehicle_number?: string | null;
  license_number?: string | null;
  status: DriverStatus;
  is_active: number;
  max_concurrent_orders: number;
  active_deliveries_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface DeliveryAttempt {
  id: number;
  delivery_id: number;
  attempt_number: number;
  driver_id?: number | null;
  driver_name?: string | null;
  started_at: string;
  arrived_at?: string | null;
  completed_at?: string | null;
  result: AttemptResult;
  failure_reason_code?: string | null;
  notes?: string | null;
  created_at?: string;
}

export interface DeliveryStatusHistory {
  id: number;
  delivery_id: number;
  from_status?: string | null;
  to_status: DeliveryStatus;
  changed_by: number;
  changed_by_name?: string | null;
  reason?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface DeliveryOrder {
  id: number;
  delivery_number: string;
  order_id?: number | null;
  invoice_id: number;
  invoice_number?: string;
  customer_id: number;
  customer_name?: string;
  customer_phone?: string;
  customer_address_id?: number | null;
  address?: CustomerAddress | null;
  zone_id?: number | null;
  zone_name?: string | null;
  driver_id?: number | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  driver_vehicle?: string | null;
  delivery_type: DeliveryType;
  priority: DeliveryPriority;
  status: DeliveryStatus;
  requested_date: string; // YYYY-MM-DD
  time_slot_start?: string | null;
  time_slot_end?: string | null;
  subtotal_paise: number;
  delivery_charge_paise: number;
  discount_paise: number;
  total_paise: number;
  payment_method: string;
  payment_status: PaymentStatusType;
  cod_expected_paise: number;
  cod_collected_paise: number;
  cod_variance_paise: number;
  cod_reconciled: number;
  otp_code?: string | null;
  otp_verified: number;
  special_prep_instructions?: string | null;
  customer_notes?: string | null;
  delivery_address_snapshot?: string | null;
  internal_notes?: string | null;
  estimated_minutes?: number | null;
  actual_prep_minutes?: number | null;
  actual_delivery_minutes?: number | null;
  scheduled_at?: string | null;
  dispatched_at?: string | null;
  delivered_at?: string | null;
  delivered_by?: number | null;
  delivered_by_name?: string | null;
  delivered?: number;
  payment_received?: number;
  payment_received_at?: string | null;
  payment_received_by?: number | null;
  payment_received_by_name?: string | null;
  amount_paid_now_paise?: number;
  amount_pending_paise?: number;
  cancelled_at?: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
  items_summary?: string;
  attempts?: DeliveryAttempt[];
  status_history?: DeliveryStatusHistory[];
}

export interface CreateDeliveryInput {
  invoice_id?: number;
  invoice_number?: string;
  customer_id?: number | null;
  customer_name?: string;
  delivered?: number;
  payment_received?: number;
  amount_paid_now_paise?: number;
  amount_pending_paise?: number;
  customer_phone?: string;
  delivery_address_snapshot?: string;
  delivery_notes?: string;
  assigned_staff_id?: number | null;
  scheduled_slot?: string | null;
  subtotal_paise?: number;
  total_paise?: number;
  customer_address_id?: number;
  new_address?: Partial<CustomerAddress>;
  zone_id?: number;
  driver_id?: number;
  delivery_type?: DeliveryType;
  priority?: DeliveryPriority;
  requested_date?: string;
  time_slot_start?: string;
  time_slot_end?: string;
  delivery_charge_paise?: number;
  payment_method?: string;
  special_prep_instructions?: string;
  customer_notes?: string;
  internal_notes?: string;
  items?: Array<{
    product_variant_id: number;
    quantity_grams?: number | null;
    quantity_units?: number | null;
  }>;
}

export interface DeliveryCODReconciliation {
  id: number;
  reconciliation_number: string;
  driver_id: number;
  driver_name?: string;
  shift_id?: number | null;
  reconciliation_date: string;
  total_deliveries: number;
  total_expected_paise: number;
  total_collected_paise: number;
  total_variance_paise: number;
  status: 'open' | 'verified' | 'discrepancy_resolved';
  notes?: string | null;
  verified_by?: number | null;
  verified_by_name?: string | null;
  created_at: string;
}

export interface DeliveryStats {
  totalDeliveries: number;
  activeDeliveries: number;
  completedDeliveries: number;
  failedDeliveries: number;
  cancelledDeliveries: number;
  onTimePercent: number;
  avgDeliveryMinutes: number;
  avgPrepMinutes: number;
  totalDeliveryRevenuePaise: number;
  totalDeliveryChargesPaise: number;
  codPendingPaise: number;
  unassignedCount: number;
}

export interface DeliveryFilterState {
  status?: string; // 'all' or specific DeliveryStatus
  zoneId?: string; // 'all' or number string
  driverId?: string; // 'all' or number string
  priority?: string; // 'all' or DeliveryPriority
  datePreset?: string;
  startDate?: string;
  endDate?: string;
  searchTerm?: string;
}

export interface DeliveryException {
  id: number;
  delivery_number: string;
  type: 'overdue' | 'failed' | 'unassigned' | 'cod_mismatch' | 'missing_coordinates';
  title: string;
  description: string;
  severity: 'warning' | 'critical' | 'info';
  customer_name?: string;
  driver_name?: string;
  total_paise: number;
  created_at: string;
}
