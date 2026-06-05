import { Request, Response, NextFunction } from 'express';
import { Category } from '@/api/v1/models/category.model';
import { Product } from '@/api/v1/models/product.model';
import { getDescendantIds } from '@/api/v1/controllers/category.controller';
import { httpError } from '@/api/v1/utils/httpError';
import httpResponse from '@/api/v1/utils/httpResponse';

/**
 * GET /api/v1/home
 * Optimized endpoint for the storefront homepage.
 * Returns top root categories that have products, with their top 4 products each.
 */
export const getHomeStorefront = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 1. Fetch First 4 Root Categories that have subcategories or are parents
    const rootCategories = await Category.find({
      parentCategoryId: null,
    })
      .sort({ createdAt: 1 })
      .limit(4)
      .lean();

    // 2. For each category, fetch its top 5 products (including descendants)
    const sectionsPromise = rootCategories.map(async (category) => {
      const descendantIds = await getDescendantIds(category._id.toString());
      const categoryIds = [category._id, ...descendantIds];

      const products = await Product.find({
        categoryId: { $in: categoryIds },
        isActive: true,
        isPublished: true,
      })
        .select(
          'title coverImage displayPrice displayMrp displayDiscount defaultVariantId default_slug brandId categoryId isActive isPublished'
        )
        .populate('brandId', 'name')
        .populate('categoryId', 'name')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();

      return {
        id: category._id,
        name: category.name,
        slug: category.slug,
        products,
      };
    });

    const activeSections = await Promise.all(sectionsPromise);

    // 3. Fetch Latest Products (Globally)
    const latestProducts = await Product.find({
      isActive: true,
      isPublished: true,
    })
      .select(
        'title coverImage displayPrice displayMrp displayDiscount defaultVariantId default_slug brandId categoryId isActive isPublished'
      )
      .populate('brandId', 'name')
      .populate('categoryId', 'name')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    return httpResponse(req, res, 200, 'Homepage data fetched successfully', {
      latestProducts,
      activeSections,
    });
  } catch (error: unknown) {
    return httpError(next, error, req, 500);
  }
};
