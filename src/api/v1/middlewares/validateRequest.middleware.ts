import { Request, Response, NextFunction } from 'express';
import { ZodObject, ZodError, ZodRawShape } from 'zod';
import { httpError } from '@/api/v1/utils/httpError';

export const validateRequest = (schema: ZodObject<ZodRawShape>) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });

      // Update request objects with parsed/transformed data
      req.body = result.body;
      
      // Use Object.assign for query and params as they might be read-only getters in Express 5
      if (result.query) {
        Object.assign(req.query, result.query);
      }
      if (result.params) {
        Object.assign(req.params, result.params);
      }

      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.issues
          .map((err) => `${String(err.path[err.path.length - 1])}: ${err.message}`)
          .join(', ');

        const validationError = new Error(`Validation Failed -> ${errorMessages}`);

        return httpError(next, validationError, req, 400);
      }

      return httpError(next, error, req, 400);
    }
  };
};
