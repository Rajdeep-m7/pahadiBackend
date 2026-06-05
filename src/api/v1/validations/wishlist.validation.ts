import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const toggleWishlistSchema = z.object({
  params: z.object({
    variantId: z.string().regex(objectIdRegex, 'Invalid Variant ID format'),
  }),
});
