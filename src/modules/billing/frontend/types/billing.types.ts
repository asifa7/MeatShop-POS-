export interface Product {
  id: number;
  product_code: string;
  name: string;
  unit_type: 'weight' | 'piece' | 'live_dual';
  category: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface ProductVariant {
  id: number;
  product_id: number;
  variant_name: string;
  current_rate_paise_per_unit: number;
  effective_from: string;
  is_active: number;
  product_code: string;
  product_name: string;
  unit_type: 'weight' | 'piece' | 'live_dual';
  category: string;
}

export interface Invoice {
  id: number;
  invoice_number: string | null;
  financial_year: string | null;
  customer_id: number | null;
  customer_face_id: number | null;
  status: 'draft' | 'held' | 'completed' | 'void' | 'returned';
  is_gst_invoice: number;
  gst_number_snapshot: string | null;
  subtotal_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  tax_paise: number;
  total_paise: number;
  payment_status: 'unpaid' | 'partial' | 'paid';
  created_by: number;
  created_at: string;
  completed_at: string | null;
  voided_by: number | null;
  void_reason: string | null;
  voided_at: string | null;
  discount_paise?: number;
  discount_percent?: number;
  flat_deduction_paise?: number;
  dressing_charge_paise?: number;
  round_off_paise?: number;
  narration?: string | null;
  print_delivery_token?: number;
  whatsapp_delivery_status?: 'pending' | 'sent' | 'not_delivered' | null;
}

export interface ManualBatchAllocation {
  batch_id: number;
  batch_number: string;
  quantity_grams: number | null;
  quantity_units: number | null;
  unit_cost_paise: number;
}

export interface InvoiceItem {
  id: number;
  invoice_id: number;
  product_variant_id: number;
  quantity_grams: number | null;
  quantity_units: number | null;
  rate_paise_snapshot: number;
  line_subtotal_paise: number;
  gst_rate_percent_snapshot: number | null;
  line_total_paise: number;
  override_applied: number;
  override_reason: string | null;
  overridden_by: number | null;
  variant_name: string;
  product_name: string;
  product_code: string;
  unit_type: 'weight' | 'piece' | 'live_dual';
  category: string;
  stock_source?: 'processed_chicken' | 'mutton_regular' | 'refrigerator' | 'none';
  refrigerator_stock_id?: number | null;
  is_manual_batch_selected?: number;
  manual_batch_allocations?: ManualBatchAllocation[];
}

export interface Payment {
  id: number;
  invoice_id: number;
  method: 'cash' | 'upi' | 'card' | 'split';
  amount_paise: number;
  reference_number: string | null;
  received_at: string;
}

export interface InvoiceDetail {
  invoice: Invoice;
  items: InvoiceItem[];
  payments: Payment[];
}

export interface CartItemLocal {
  variantId: number;
  variant: ProductVariant;
  quantityGrams: number | null;
  quantityUnits: number | null;
  ratePaiseSnapshot: number;
  overrideApplied: boolean;
  overrideReason: string | null;
  overriddenBy: number | null;
  overrideRatePaise: number | null;
  manualBatchAllocations?: ManualBatchAllocation[];
}

export function formatPaise(paise: number): string {
  const rupees = paise / 100;
  return '₹' + rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatGramsToKg(grams: number): string {
  const kg = grams / 1000;
  return kg.toFixed(3) + ' kg';
}

import { calculateLineAmount, calculateLineTax as coreCalculateLineTax } from '../../../../core/shared/math';

export function calculateLineSubtotal(
  unitType: 'weight' | 'piece',
  quantityGrams: number | null,
  quantityUnits: number | null,
  ratePaiseSnapshot: number
): number {
  return calculateLineAmount(unitType, quantityGrams, quantityUnits, ratePaiseSnapshot);
}

export function calculateLineTax(
  lineSubtotalPaise: number,
  gstRatePercentSnapshot: number | null
): number {
  return coreCalculateLineTax(lineSubtotalPaise, gstRatePercentSnapshot).lineTaxPaise;
}
