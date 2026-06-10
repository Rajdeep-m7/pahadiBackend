import { z } from 'zod';

export const sendNotificationSchema = z.object({
  body: z.object({
    title: z.string().min(1, 'Title is required'),
    body: z.string().min(1, 'Body is required'),
    target: z.enum(['all', 'cart', 'wishlist']),
  }),
});
