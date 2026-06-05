import { z } from 'zod';
import mongoose from 'mongoose';

const objectIdSchema = z.string().refine((id) => mongoose.isValidObjectId(id), {
  message: 'Invalid MongoDB ObjectId',
});

export const createReviewSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),

  body: z.object({
    rating: z.coerce
      .number()
      .min(1, 'Rating must be at least 1')
      .max(5, 'Rating cannot exceed 5'),

    comment: z
      .string()
      .min(1, 'Comment is required')
      .max(1000, 'Comment is too long'),

    images: z
      .array(
        z.object({
          url: z.string().url('Invalid image URL'),
          publicId: z.string().min(1, 'PublicId is required'),
        })
      )
      .optional(),
  }),
});

export const reviewIdSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
});

export const updateReviewSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),

  body: z.object({
    rating: z.coerce
      .number()
      .min(1, 'Rating must be at least 1')
      .max(5, 'Rating cannot exceed 5')
      .optional(),

    comment: z
      .string()
      .min(1, 'Comment cannot be empty')
      .max(1000, 'Comment is too long')
      .optional(),

    images: z
      .array(
        z.object({
          url: z.string().url('Invalid image URL'),
          publicId: z.string().min(1, 'PublicId is required'),
        })
      )
      .optional(),
  }),
});

export const reviewActiveSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
  body: z.object({
    isActive: z.boolean(),
  }),
});