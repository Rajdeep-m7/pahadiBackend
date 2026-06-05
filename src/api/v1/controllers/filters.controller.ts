import { Request, Response, NextFunction } from 'express';
import { getCategoryFilters, getSearchFilters } from '@/api/v1/services/filters.service';
import { httpError } from '@/api/v1/utils/httpError';
import httpResponse from '@/api/v1/utils/httpResponse';

export const getFiltersByCategorySlug = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const slug = req.params.slug as string;
    const filters = await getCategoryFilters(slug);

    if (!filters) {
      throw new Error('Category not found');
    }

    return httpResponse(req, res, 200, 'Filters fetched successfully', filters);
  } catch (error: unknown) {
    return httpError(next, error, req, 404);
  }
};

export const getFiltersForSearch = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const filters = await getSearchFilters();
    return httpResponse(req, res, 200, 'Search filters fetched successfully', filters);
  } catch (error: unknown) {
    return httpError(next, error, req, 500);
  }
};