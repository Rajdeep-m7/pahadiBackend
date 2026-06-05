import { z } from 'zod';


export const categoryFiltersSchema = z.object({
  type: z.enum(['category', 'search']).optional(),
}).optional();