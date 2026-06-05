import { Router } from 'express';
import {
  createBrand,
  getAllBrands,
  getBrandById,
  updateBrand,
  deleteBrand,
} from '@/api/v1/controllers/brand.controller';
import { validateRequest } from '@/api/v1/middlewares/validateRequest.middleware';
import { protect, restrictTo } from '@/api/v1/middlewares/auth.middleware';
import {
  createBrandSchema,
  updateBrandSchema,
  brandIdParamSchema,
  getAllBrandsSchema,
} from '@/api/v1/validations/brand.validation';

const router = Router();

// ==========================================
// ADMIN / STAFF ROUTES
// ==========================================
router.use(protect);
router.use(restrictTo('admin', 'staff'));

router.get('/', validateRequest(getAllBrandsSchema), getAllBrands);
router.get('/:id', validateRequest(brandIdParamSchema), getBrandById);
router.post('/', validateRequest(createBrandSchema), createBrand);
router.patch('/:id', validateRequest(updateBrandSchema), updateBrand);
router.delete('/:id', restrictTo('admin'), validateRequest(brandIdParamSchema), deleteBrand);

export default router;
