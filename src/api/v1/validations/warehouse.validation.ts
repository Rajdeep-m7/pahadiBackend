import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

// ==========================================
// CREATE WAREHOUSE SCHEMA
// ==========================================
export const createWarehouseSchema = z.object({
  body: z
    .object({
      pickupLocation: z
        .string({ message: 'Pickup location nickname is required' })
        .min(3, 'Pickup location must be at least 3 characters')
        .regex(/^[a-zA-Z0-9_-]+$/, 'Pickup location cannot contain spaces or special characters'),
      name: z.string({ message: 'Name is required' }).min(3, 'Name must be at least 3 characters'),
      email: z.email({ message: 'Invalid email format' }),
      phone: z.string({ message: 'Phone is required' }).min(10, 'Phone must be at least 10 digits'),
      address: z.string({ message: 'Address is required' }),
      address2: z.string().optional(),
      city: z.string({ message: 'City is required' }),
      state: z.string({ message: 'State is required' }),
      pinCode: z.string({ message: 'PIN code is required' }).length(6, 'PIN code must be 6 digits'),
    })
    .strict(),
});

// ==========================================
// UPDATE WAREHOUSE SCHEMA
// ==========================================
export const updateWarehouseSchema = z.object({
  params: z.object({
    id: z
      .string({ message: 'Warehouse ID is required' })
      .regex(objectIdRegex, 'Invalid Warehouse ID format'),
  }),
  body: z
    .object({
      name: z.string().min(3).optional(),
      email: z.email().optional(),
      phone: z.string().min(10).optional(),
      address: z.string().optional(),
      address2: z.string().optional(),
      isActive: z.boolean().optional(),
    })
    .strict(),
});

// ==========================================
// GET ALL WAREHOUSES SCHEMA
// ==========================================
export const getWarehousesSchema = z.object({
  query: z
    .object({
      isActive: z.enum(['true', 'false']).optional(),
    })
    .strict(),
});

// ==========================================
// GENERIC ID PARAM SCHEMA
// ==========================================
export const warehouseIdParamSchema = z.object({
  params: z.object({
    id: z
      .string({ message: 'Warehouse ID is required' })
      .regex(objectIdRegex, 'Invalid Warehouse ID format'),
  }),
});

// Reusable for GET by ID, toggle status, and linked products
export const getWarehouseByIdSchema = warehouseIdParamSchema;
export const toggleWarehouseStatusSchema = warehouseIdParamSchema;
export const getWarehouseProductsSchema = warehouseIdParamSchema;
