import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const initiatePaymentSchema = z.object({
  body: z.object({
    orderId: z
      .string({ message: 'Order ID is required' })
      .regex(objectIdRegex, 'Invalid Order ID format'),
  }),
});

export const verifyPaymentSchema = z.object({
  body: z.object({
    razorpayOrderId: z.string({ message: 'Razorpay Order ID is required' }),
    razorpayPaymentId: z.string({ message: 'Razorpay Payment ID is required' }),
    razorpaySignature: z.string({ message: 'Razorpay Signature is required' }),
  }),
});

export const getAllTransactionsAdminSchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    status: z.enum(['pending', 'success', 'failed', 'refunded']).optional(),
    search: z.string().optional(),
  }),
});

export const getTransactionByIdSchema = z.object({
  params: z.object({
    id: z
      .string({ message: 'Transaction ID is required' })
      .regex(objectIdRegex, 'Invalid Transaction ID format'),
  }),
});
