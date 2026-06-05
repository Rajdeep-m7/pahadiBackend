import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

// HELPER: Safely parse JSON strings from FormData
const safeJsonParse = (val: unknown) => {
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }
  return val;
};

export const createVariantSchema = z.object({
  body: z
    .object({
      productId: z.string().regex(objectIdRegex, 'Invalid Product ID'),
      title: z.string().min(3),
      sku: z.string().min(3),
      price: z.preprocess((val) => Number(val), z.number().min(0)),
      mrp: z.preprocess((val) => Number(val), z.number().min(0)),
      discount: z.preprocess(
        safeJsonParse,
        z
          .object({
            type: z.enum(['percentage', 'flat']),
            value: z.number().min(0),
          })
          .optional()
      ),
      stocks: z.preprocess((val) => Number(val), z.number().min(0)),
      attributes: z.preprocess(safeJsonParse, z.record(z.string(), z.string())).optional(),
      isDefault: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),
    })
    .strict(),
});

export const updateVariantSchema = z.object({
  params: z.object({
    id: z.string().regex(objectIdRegex, 'Invalid Variant ID'),
  }),
  body: z.object({
    title: z.string().min(3).optional(),
    sku: z.string().min(3).optional(),
    price: z.preprocess((val) => (val ? Number(val) : undefined), z.number().min(0).optional()),
    mrp: z.preprocess((val) => (val ? Number(val) : undefined), z.number().min(0).optional()),
    discount: z.preprocess(
      safeJsonParse,
      z
        .object({
          type: z.enum(['percentage', 'flat']),
          value: z.number().min(0),
        })
        .optional()
    ),
    stocks: z.preprocess((val) => (val ? Number(val) : undefined), z.number().min(0).optional()),
    attributes: z.preprocess(safeJsonParse, z.record(z.string(), z.string())).optional(),
    isActive: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),
    isDefault: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),
    removedImagesPublicIds: z.union([z.string(), z.array(z.string())]).optional(),
  }),
});

export const variantIdParamSchema = z.object({
  params: z.object({
    id: z.string().regex(objectIdRegex, 'Invalid Variant ID'),
  }),
});

export const variantSlugParamSchema = z.object({
  params: z.object({
    slug: z.string().min(1, 'Slug is required'),
  }),
});

export const getVariantsByProductSchema = z.object({
  params: z.object({
    productId: z.string().regex(objectIdRegex, 'Invalid Product ID'),
  }),
});

export const searchVariantsSchema = z.object({
  query: z
    .looseObject({
      search: z.string().optional(),
      page: z.string().optional(),
      limit: z.string().optional(),
    })
    .passthrough(), // Allow other attribute filters
});
