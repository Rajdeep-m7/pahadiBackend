import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const addressBody = z.object({
  fullName: z.string().min(3, 'Full name must be at least 3 characters'),
  phone: z.string().min(10, 'Phone number must be at least 10 characters'),
  addressLine1: z.string().min(5, 'Address line 1 must be at least 5 characters'),
  addressLine2: z.string().optional(),
  city: z.string().min(2, 'City is required'),
  state: z.string().min(2, 'State is required'),
  postalCode: z.string().min(6, 'Postal code must be at least 6 characters'),
  country: z.string().default('India'),
  isDefault: z.boolean().optional(),
});

export const createAddressSchema = z.object({
  body: addressBody,
});

export const updateAddressSchema = z.object({
  params: z.object({
    id: z.string().regex(objectIdRegex, 'Invalid Address ID'),
  }),
  body: addressBody.partial(),
});

export const addressIdParamSchema = z.object({
  params: z.object({
    id: z.string().regex(objectIdRegex, 'Invalid Address ID'),
  }),
});
