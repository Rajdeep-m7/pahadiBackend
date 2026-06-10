import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

// ==========================================
// CREATE ORDER SCHEMA (Customer)
// ==========================================
export const createOrderSchema = z.object({
  body: z.object({
    items: z
      .array(
        z.object({
          variantId: z.string().regex(objectIdRegex, 'Invalid variant ID'),
          quantity: z.number().min(1, 'Quantity must be at least 1'),
        })
      )
      .min(1, 'At least one item is required'),
    shippingAddress: z.object({
      fullName: z.string().min(3, 'Full name is required'),
      phone: z.string().min(10, 'Valid phone number is required'),
      addressLine1: z.string().min(5, 'Address line 1 is required'),
      addressLine2: z.string().optional(),
      city: z.string().min(2, 'City is required'),
      state: z.string().min(2, 'State is required'),
      postalCode: z.string().min(6, 'Valid postal code is required'),
      country: z.string().default('India'),
    }),
    appliedCoupon: z.string().optional(),
    isCartCheckout: z.boolean().optional(),
  }),
});

// ==========================================
// GET MY ORDERS SCHEMA (Customer)
// ==========================================
export const getMyOrdersSchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    status: z
      .enum(['pending_payment', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'])
      .optional(),
  }),
});

// ==========================================
// GET ORDER BY ID SCHEMA (Customer)
// ==========================================
export const getOrderByIdSchema = z.object({
  params: z.object({
    id: z
      .string({ message: 'Order ID is required' })
      .regex(objectIdRegex, 'Invalid Order ID format'),
  }),
});

// ==========================================
// CANCEL ORDER SCHEMA (Customer)
// ==========================================
export const cancelOrderSchema = z.object({
  params: z.object({
    id: z
      .string({ message: 'Order ID is required' })
      .regex(objectIdRegex, 'Invalid Order ID format'),
  }),
  body: z.object({
    reason: z.string().optional(),
  }),
});

// ==========================================
// CANCEL ORDER SCHEMA (Admin)
// ==========================================
export const cancelOrderAdminSchema = z.object({
  params: z.object({
    id: z
      .string({ message: 'Order ID is required' })
      .regex(objectIdRegex, 'Invalid Order ID format'),
  }),
  body: z.object({
    reason: z.string().optional(),
  }),
});

// ==========================================
// CANCEL ORDER ITEM SCHEMA (Customer & Admin)
// ==========================================
export const cancelOrderItemSchema = z.object({
  params: z.object({
    id: z
      .string({ message: 'Order ID is required' })
      .regex(objectIdRegex, 'Invalid Order ID format'),
    itemId: z
      .string({ message: 'Item ID is required' })
      .regex(objectIdRegex, 'Invalid Item ID format'),
  }),
  body: z.object({
    reason: z.string().optional(),
  }),
});

// ==========================================
// MANUAL REFUND SCHEMA (Admin)
// ==========================================
export const refundOrderSchema = z.object({
  params: z.object({
    id: z
      .string({ message: 'Order ID is required' })
      .regex(objectIdRegex, 'Invalid Order ID format'),
  }),
  body: z.object({
    reason: z.string().optional(),
  }),
});

// ==========================================
// GET ALL ORDERS SCHEMA (Admin)
// ==========================================
export const getAllOrdersAdminSchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    status: z
      .enum(['pending_payment', 'processing', 'shipped', 'delivered', 'cancelled', 'returned', 'payment_failed', 'payment_expired'])
      .optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    search: z.string().optional(),
    isConfirmed: z.enum(['true', 'false']).optional(),
  }),
});

// ==========================================
// TRIGGER DISPATCH SCHEMA (Admin — Shiprocket)
// ==========================================
export const triggerDispatchSchema = z.object({
  params: z.object({
    id: z
      .string({ message: 'Order ID is required' })
      .regex(objectIdRegex, 'Invalid Order ID format'),
  }),
  body: z.object({
    weight: z.number({ message: 'Weight must be a number' }).positive().optional(),
    length: z.number({ message: 'Length must be a number' }).positive().optional(),
    breadth: z.number({ message: 'Breadth must be a number' }).positive().optional(),
    height: z.number({ message: 'Height must be a number' }).positive().optional(),
  }).optional(),
});

// ==========================================
// UPDATE ORDER STATUS SCHEMA (Admin — general transitions)
// ==========================================
export const updateOrderStatusAdminSchema = z.object({
  params: z.object({
    id: z
      .string({ message: 'Order ID is required' })
      .regex(objectIdRegex, 'Invalid Order ID format'),
  }),
  body: z.object({
    orderStatus: z.enum(
      ['pending_payment', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'],
      { message: 'Invalid order status' }
    ),
    comment: z.string().optional(),
  }),
});

// ==========================================
// CONFIRM PARTIAL ORDER SCHEMA (Admin)
// ==========================================
export const confirmPartialOrderSchema = z.object({
  params: z.object({
    id: z
      .string({ message: 'Order ID is required' })
      .regex(objectIdRegex, 'Invalid Order ID format'),
  }),
  body: z.object({
    items: z
      .array(
        z.object({
          itemId: z.string().regex(objectIdRegex, 'Invalid item ID format'),
          quantity: z.number().int().min(0, 'Quantity cannot be negative'),
        })
      )
      .min(1, 'At least one item must be provided'),
  }),
});

// ==========================================
// TRACK ORDER SCHEMA (Admin)
// ==========================================
export const trackOrderSchema = z.object({
  params: z.object({
    id: z
      .string({ message: 'Order ID is required' })
      .regex(objectIdRegex, 'Invalid Order ID format'),
  }),
});
