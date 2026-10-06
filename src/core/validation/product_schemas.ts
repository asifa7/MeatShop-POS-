import { z } from 'zod';

export const PRODUCT_CATEGORIES = ['Chicken', 'Mutton', 'Seafood', 'Eggs'] as const;
export type ProductCategory = typeof PRODUCT_CATEGORIES[number];

export const CreateProductSchema = z.object({
  name: z.string().min(1, 'Product name is required').max(120),
  category: z.enum(PRODUCT_CATEGORIES, {
    errorMap: () => ({ message: 'Category must be one of: Chicken, Mutton, Seafood, Eggs' }),
  }),
  unit_type: z.enum(['weight', 'piece', 'live_dual'], {
    errorMap: () => ({ message: 'Unit type must be weight, piece, or live_dual' }),
  }),
  product_code: z.string().min(1).max(50).optional(),
  is_processed_cut: z.number().int().min(0).max(1).optional().default(0),
});

export type CreateProductInput = z.infer<typeof CreateProductSchema>;

export const UpdateProductSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  category: z.enum(PRODUCT_CATEGORIES).optional(),
  unit_type: z.enum(['weight', 'piece', 'live_dual']).optional(),
  product_code: z.string().min(1).max(50).optional(),
  is_processed_cut: z.number().int().min(0).max(1).optional(),
});

export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;

export const CreateVariantSchema = z.object({
  product_id: z.number().int().positive('Product ID must be a positive integer'),
  variant_name: z.string().min(1, 'Variant name is required').max(120),
  rate_paise: z.number().int().positive('Rate must be a positive integer in paise'),
});

export type CreateVariantInput = z.infer<typeof CreateVariantSchema>;

export const UpdateVariantSchema = z.object({
  variant_name: z.string().min(1).max(120).optional(),
});

export type UpdateVariantInput = z.infer<typeof UpdateVariantSchema>;

export const UpdateRateSchema = z.object({
  variant_id: z.number().int().positive(),
  new_rate_paise: z.number().int().positive('New rate must be a positive integer in paise'),
  set_by: z.number().int().positive().default(1),
});

export type UpdateRateInput = z.infer<typeof UpdateRateSchema>;
