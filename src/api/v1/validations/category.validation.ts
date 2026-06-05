import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

// HELPER: Safely parse JSON strings from FormData without crashing the server
const safeJsonParse = (val: unknown) => {
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return val; // Return the raw invalid string so Zod's array validation catches it
    }
  }
  return val;
};

export const createCategorySchema = z.object({
  body: z.object({
    name: z
      .string({ message: 'Category name is required' })
      .min(2, 'Category name must be at least 2 characters'),
    slug: z.string({ message: 'Slug is required' }).min(2, 'Slug must be at least 2 characters'),
    parentCategoryId: z
      .string()
      .regex(objectIdRegex, 'Invalid Parent Category ID')
      .optional()
      .nullable(),
    taxes: z
      .preprocess(
        safeJsonParse,
        z.array(
          z.object({
            name: z.string({ message: 'Tax name is required' }),
            slab: z.coerce.number({ message: 'Tax slab is required' }).min(0).max(100),
          })
        )
      )
      .refine((taxes) => {
        if (!taxes) return true;
        const names = taxes.map((t: any) => t.name.toLowerCase());
        return names.length === new Set(names).size;
      }, { message: 'Tax names must be unique within the same category' })
      .optional(),
  }),
});

export const updateCategorySchema = z.object({
  params: z.object({
    id: z.string().regex(objectIdRegex, 'Invalid Category ID'),
  }),
  body: z.object({
    name: z.string().min(2).optional(),
    slug: z.string().min(2).optional(),
    parentCategoryId: z
      .string()
      .regex(objectIdRegex, 'Invalid Parent Category ID')
      .optional()
      .nullable(),
    taxes: z
      .preprocess(
        safeJsonParse,
        z.array(
          z.object({
            name: z.string({ message: 'Tax name is required' }),
            slab: z.coerce.number({ message: 'Tax slab is required' }).min(0).max(100),
          })
        )
      )
      .refine((taxes) => {
        if (!taxes) return true;
        const names = taxes.map((t: any) => t.name.toLowerCase());
        return names.length === new Set(names).size;
      }, { message: 'Tax names must be unique within the same category' })
      .optional(),
  }),
});

export const categoryIdParamSchema = z.object({
  params: z.object({
    id: z.string().regex(objectIdRegex, 'Invalid Category ID'),
  }),
});

export const getEligibleParentsSchema = z.object({
  query: z.object({
    search: z.string().min(2, 'Search query must be at least 2 characters').optional(),
    categoryId: z.string().regex(objectIdRegex, 'Invalid Category ID').optional(),
  }),
});

export const getAllCategoriesSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    parentCategoryId: z.string().optional(),
    tree: z.string().optional(),
  }),
});
