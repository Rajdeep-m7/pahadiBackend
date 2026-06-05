import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const createReturnRequestSchema = z.object({
  body: z.object({
    orderId: z
      .string({ message: 'Order ID is required' })
      .regex(objectIdRegex, 'Invalid Order ID format'),
    itemId: z
      .string({ message: 'Item ID is required' })
      .regex(objectIdRegex, 'Invalid Item ID format'),
    type: z.enum(['return', 'replace']),
    reason: z.string().min(5, 'Reason must be at least 5 characters'),
    customerComment: z.string().optional(),
    imagesArray: z
      .array(
        z.object({
          url: z.string().url(),
          publicId: z.string(),
        })
      )
      .min(1, 'At least one image proof is required'),
    pickupAddress: z.object({
      fullName: z.string().min(3),
      phone: z.string().min(10),
      addressLine1: z.string().min(5),
      addressLine2: z.string().optional(),
      city: z.string().min(2),
      state: z.string().min(2),
      postalCode: z.string().min(6),
      country: z.string().default('India'),
    }),
  }),
});

export const getAllReturnRequestsSchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    status: z
      .enum(['requested', 'approved', 'rejected', 'pickup_scheduled', 'item_received', 'resolved'])
      .optional(),
  }),
});

export const approveReturnRequestSchema = z.object({
  params: z.object({
    id: z
      .string({ message: 'Request ID is required' })
      .regex(objectIdRegex, 'Invalid Request ID format'),
  }),
  body: z.object({
    logisticsMethod: z.enum(['shiprocket', 'manual']),
    adminNotes: z.string().optional(),
  }),
});

export const rejectReturnRequestSchema = z.object({
  params: z.object({
    id: z
      .string({ message: 'Request ID is required' })
      .regex(objectIdRegex, 'Invalid Request ID format'),
  }),
  body: z.object({
    reason: z.string().min(5, 'Rejection reason must be at least 5 characters'),
  }),
});

export const markItemReceivedSchema = z.object({
  params: z.object({
    id: z
      .string({ message: 'Request ID is required' })
      .regex(objectIdRegex, 'Invalid Request ID format'),
  }),
  body: z.object({
    adminNotes: z.string().optional(),
  }),
});

export const resolveReturnSchema = z.object({
  params: z.object({
    id: z
      .string({ message: 'Request ID is required' })
      .regex(objectIdRegex, 'Invalid Request ID format'),
  }),
  body: z.object({
    refundMethod: z.enum(['razorpay', 'manual']).optional(),
    manualReference: z.string().optional(),
  }),
});
