import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

// ==========================================
// CREATE COUPON
// ==========================================
export const createCouponSchema = z.object({
  body: z.object({
    code: z
      .string({ message: 'Coupon code is required' })
      .min(2, 'Coupon code must be at least 2 characters')
      .max(20, 'Coupon code must be at most 20 characters')
      .regex(/^[A-Z0-9_]+$/, 'Coupon code must contain only uppercase letters, numbers, and underscores'),
    type: z.enum(['percentage', 'flat'], { message: 'Coupon type must be "percentage" or "flat"' }),
    value: z
      .number({ message: 'Coupon value is required' })
      .positive('Coupon value must be positive'),
    minOrderValue: z.number().min(0).optional().default(0),
    maxDiscount: z.number().min(0).optional().default(0),
    expiresAt: z
      .string({ message: 'Expiration date is required' })
      .refine((val) => !isNaN(Date.parse(val)), {
        message: 'Invalid expiration date format',
      })
      .refine((val) => new Date(val) > new Date(), {
        message: 'Expiration date must be in the future',
      }),
    userLimit: z.number().int().min(0).optional().default(1),
  }),
});

// ==========================================
// UPDATE COUPON
// ==========================================
export const updateCouponSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Coupon ID is required'),
  }),
  body: z.object({
    code: z
      .string()
      .min(2, 'Coupon code must be at least 2 characters')
      .max(20, 'Coupon code must be at most 20 characters')
      .regex(/^[A-Z0-9_]+$/, 'Coupon code must contain only uppercase letters, numbers, and underscores')
      .optional(),
    type: z.enum(['percentage', 'flat']).optional(),
    value: z.number().positive('Coupon value must be positive').optional(),
    minOrderValue: z.number().min(0).optional(),
    maxDiscount: z.number().min(0).optional(),
    expiresAt: z
      .string()
      .refine((val) => !isNaN(Date.parse(val)), {
        message: 'Invalid expiration date format',
      })
      .optional(),
    userLimit: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
  }),
});

// ==========================================
// GET COUPON BY ID
// ==========================================
export const getCouponByIdSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Coupon ID is required'),
  }),
});

// ==========================================
// DELETE COUPON
// ==========================================
export const deleteCouponSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Coupon ID is required'),
  }),
});

// ==========================================
// VALIDATE COUPON (Pre-order)
// ==========================================
export const validateCouponSchema = z.object({
  query: z.object({
    code: z.string().min(1, 'Coupon code is required'),
    subtotal: z
      .string()
      .optional()
      .transform((val) => (val ? parseFloat(val) : 0)),
  }),
});

// ==========================================
// GET AVAILABLE COUPONS (Customer)
// ==========================================
export const getAvailableCouponsSchema = z.object({
  query: z.object({
    maxOrderValue: z.string().optional().transform((val) => (val ? parseFloat(val) : undefined)),
  }),
});

// ==========================================
// GET ALL COUPONS (Admin)
// ==========================================
export const getCouponsSchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});