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

export const createProductSchema = z.object({
  body: z
    .object({
      title: z
        .string({ message: 'Title is required' })
        .min(3, 'Title must be at least 3 characters'),
      desc: z
        .string({ message: 'Description is required' })
        .min(10, 'Description must be at least 10 characters'),

      // Safely parse the FormData string into an array of objects
      specs: z
        .preprocess(
          safeJsonParse,
          z.array(
            z.object({
              key: z.string(),
              value: z.string(),
            })
          )
        )
        .optional(),

      brandId: z.string().regex(objectIdRegex, 'Invalid Brand ID'),
      categoryId: z.string().regex(objectIdRegex, 'Invalid Category ID'),
      pickupWareHouseId: z.string().regex(objectIdRegex, 'Invalid Warehouse ID'),

      returnPolicyType: z.enum(['REPLACE', 'RETURN', 'BOTH', 'NONE']).optional(),

      returnWindowDays: z.coerce.number().min(0).optional(),

      isPublished: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),

      isTaxInclude: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(true),

      taxes: z
        .preprocess(
          safeJsonParse,
          z.array(
            z.object({
              name: z.string(),
              slab: z.coerce.number(),
            })
          )
        )
        .optional(),
    })
    .strict(),
});

export const updateProductSchema = z.object({
  params: z.object({
    id: z.string().regex(objectIdRegex, 'Invalid Product ID'),
  }),
  body: z
    .object({
      title: z.string().min(3).optional(),
      desc: z.string().min(10).optional(),

      specs: z
        .preprocess(
          safeJsonParse,
          z.array(
            z.object({
              key: z.string(),
              value: z.string(),
            })
          )
        )
        .optional(),

      brandId: z.string().regex(objectIdRegex, 'Invalid Brand ID').optional(),
      categoryId: z.string().regex(objectIdRegex, 'Invalid Category ID').optional(),
      pickupWareHouseId: z.string().regex(objectIdRegex, 'Invalid Warehouse ID').optional(),

      returnPolicyType: z.enum(['REPLACE', 'RETURN', 'BOTH', 'NONE']).optional(),
      returnWindowDays: z.coerce.number().min(0).optional(),

      isActive: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),
      isPublished: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),

      isTaxInclude: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),

      taxes: z
        .preprocess(
          safeJsonParse,
          z.array(
            z.object({
              name: z.string(),
              slab: z.coerce.number(),
            })
          )
        )
        .optional(),
    })
    .strict(),
});

export const productIdParamSchema = z.object({
  params: z.object({
    id: z.string().regex(objectIdRegex, 'Invalid Product ID'),
  }),
});

export const getAllProductsSchema = z.object({
  query: z.object({
    // Upgrade: Let Zod handle the math, defaults, and limits!
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(1000).default(10),

    brandId: z.string().regex(objectIdRegex, 'Invalid Brand ID').optional(),
    categoryId: z.string().regex(objectIdRegex, 'Invalid Category ID').optional(),
    search: z.string().optional(),

    isActive: z.enum(['true', 'false']).optional(),
    isPublished: z.enum(['true', 'false']).optional(),
  }),
});

export const getProductsByCategorySlugSchema = z.object({
  params: z.object({
    slug: z.string().min(1, 'Category slug is required'),
  }),
  query: z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(1000).default(10),
    brandId: z.string().optional(), // Comma-separated: "id1,id2,id3"
    search: z.string().optional(),
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    sortBy: z.enum(['price-asc', 'price-desc', 'newest', 'oldest', 'discount']).optional(),
    subcategoryId: z.string().regex(objectIdRegex, 'Invalid Subcategory ID').optional(),
    attributes: z.string().optional(), // JSON string: {"Color":["Black","Red"],"RAM":["16GB"]}
  }),
});
