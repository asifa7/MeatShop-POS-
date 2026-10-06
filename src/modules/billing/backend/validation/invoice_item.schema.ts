import { z } from 'zod';

const BaseInvoiceItemSchema = z.object({
  invoice_id: z.number().int().positive(),
  product_variant_id: z.number().int().positive(),
  rate_paise_snapshot: z.number().int().positive(),
  gst_rate_percent_snapshot: z.number().int().min(0).nullable(),
  override_applied: z.boolean(),
  override_reason: z.string().nullable(),
  overridden_by: z.number().int().positive().nullable(),
});

const WeightItemSchema = BaseInvoiceItemSchema.extend({
  quantity_grams: z.number().int().positive({ message: 'Weight must be a positive integer in grams' }),
  quantity_units: z.null(),
});

const PieceItemSchema = BaseInvoiceItemSchema.extend({
  quantity_grams: z.null(),
  quantity_units: z.number().int().positive({ message: 'Quantity must be a positive integer' }),
});

export const AddInvoiceItemSchema = z.discriminatedUnion('unit_type', [
  WeightItemSchema.extend({ unit_type: z.literal('weight') }),
  WeightItemSchema.extend({ unit_type: z.literal('live_dual') }),
  PieceItemSchema.extend({ unit_type: z.literal('piece') }),
]).superRefine((data, ctx) => {
  if (data.override_applied) {
    if (!data.override_reason || data.override_reason.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Override reason is required when override is applied',
        path: ['override_reason'],
      });
    }
    if (!data.overridden_by) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Overridden-by user id is required when override is applied',
        path: ['overridden_by'],
      });
    }
  }
});

export type AddInvoiceItemInput = z.infer<typeof AddInvoiceItemSchema>;

export const UpdateInvoiceItemQuantitySchema = z.object({
  item_id: z.number().int().positive(),
  quantity_grams: z.number().int().positive().nullable(),
  quantity_units: z.number().int().positive().nullable(),
}).refine(
  (data) => (data.quantity_grams !== null) !== (data.quantity_units !== null),
  { message: 'Exactly one of quantity_grams or quantity_units must be provided' }
);

export type UpdateInvoiceItemQuantityInput = z.infer<typeof UpdateInvoiceItemQuantitySchema>;
