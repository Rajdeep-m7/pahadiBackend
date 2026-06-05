import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const syncCartSchema = z.object({
  body: z.object({
    items: z
      .array(
        z.object({
          variantId: z.string().regex(objectIdRegex, 'Invalid Variant ID format'),
          quantity: z.number().min(1),
        })
      )
      .max(20, 'Cart cannot have more than 20 unique items'),
  }),
});
