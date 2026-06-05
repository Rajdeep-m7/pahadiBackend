import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const createBrandSchema = z.object({
  body: z.object({
    name: z
      .string({ message: 'Brand name is required' })
      .min(2, 'Brand name must be at least 2 characters'),
  }),
});

export const updateBrandSchema = z.object({
  params: z.object({
    id: z.string().regex(objectIdRegex, 'Invalid Brand ID'),
  }),
  body: z.object({
    name: z.string().min(2).optional(),
  }),
});

export const brandIdParamSchema = z.object({
  params: z.object({
    id: z.string().regex(objectIdRegex, 'Invalid Brand ID'),
  }),
});

export const getAllBrandsSchema = z.object({
  query: z.object({
    search: z.string().optional(),
  }),
});
