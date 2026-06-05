import { Router } from 'express';
import {
  createProduct,
  getProducts,
  getProductByCategorySlug,
  getProductById,
  updateProduct,
  publishProduct,
  deleteProduct,
  getSimilarProducts,
} from '@/api/v1/controllers/product.controller';
import { getVariantsByProduct } from '@/api/v1/controllers/variant.controller';
import { getFiltersByCategorySlug, getFiltersForSearch } from '@/api/v1/controllers/filters.controller';
import { validateRequest } from '@/api/v1/middlewares/validateRequest.middleware';
import { protect, restrictTo, optionalProtect } from '@/api/v1/middlewares/auth.middleware';
import {
  createProductSchema,
  updateProductSchema,
  productIdParamSchema,
  getAllProductsSchema,
  getProductsByCategorySlugSchema,
} from '@/api/v1/validations/product.validation';
import { getVariantsByProductSchema } from '@/api/v1/validations/variant.validation';

const router = Router();

// ==========================================
// PUBLIC ROUTES
// ==========================================
router.get('/', optionalProtect, validateRequest(getAllProductsSchema), getProducts);
router.get(
  '/category/:slug',
  optionalProtect,
  validateRequest(getProductsByCategorySlugSchema),
  getProductByCategorySlug
);
router.get(
  '/category/:slug/filters',
  getFiltersByCategorySlug
);
router.get('/search/filters', getFiltersForSearch);
router.get('/:id', optionalProtect, validateRequest(productIdParamSchema), getProductById);
router.get('/:id/similar', optionalProtect, validateRequest(productIdParamSchema), getSimilarProducts);

// ==========================================
// ADMIN / STAFF ROUTES
// ==========================================
router.use(protect);
router.use(restrictTo('admin', 'staff'));

router.post('/', validateRequest(createProductSchema), createProduct);
router.patch('/:id/publish', validateRequest(productIdParamSchema), publishProduct);
router.patch('/:id', validateRequest(updateProductSchema), updateProduct);
router.delete('/:id', restrictTo('admin'), validateRequest(productIdParamSchema), deleteProduct);
router.get(
  '/:productId/variants',
  restrictTo('admin'),
  validateRequest(getVariantsByProductSchema),
  getVariantsByProduct
);

export default router;
