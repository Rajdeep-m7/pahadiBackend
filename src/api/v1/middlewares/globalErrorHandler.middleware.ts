import { Request, Response, NextFunction } from 'express';
import { type tHttpError } from '@/api/v1/interfaces/http.interface';

export const globalErrorHandler = (
  err: tHttpError,
  _: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) => {
  const statusCode = err.statusCode || 500;
  err.message = err.message || 'Internal Server Error';

  return res.status(statusCode).json(err);
};
