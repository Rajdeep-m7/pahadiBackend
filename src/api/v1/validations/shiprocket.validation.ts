import { z } from 'zod';

// ==========================================
// CHECK SERVICEABILITY SCHEMA
// ==========================================
export const checkServiceabilitySchema = z.object({
  query: z.object({
    pickup_postcode: z.string().min(6, 'Valid pickup postcode is required'),
    delivery_postcode: z.string().min(6, 'Valid delivery postcode is required'),
    weight: z.string().optional().default('0.5'),
    cod: z.enum(['0', '1']).optional().default('0'),
  }),
});
