import { Router } from 'express';
import {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
  getEligibleParents,
} from '@/api/v1/controllers/category.controller';
import { validateRequest } from '@/api/v1/middlewares/validateRequest.middleware';
import { protect, restrictTo } from '@/api/v1/middlewares/auth.middleware';
import {
  createCategorySchema,
  updateCategorySchema,
  categoryIdParamSchema,
  getAllCategoriesSchema,
  getEligibleParentsSchema,
} from '@/api/v1/validations/category.validation';

const router = Router();

// ==========================================
// PUBLIC ROUTES
// ==========================================
router.get('/', validateRequest(getAllCategoriesSchema), getAllCategories);
router.get('/eligible-parents', validateRequest(getEligibleParentsSchema), getEligibleParents);
router.get('/:id', validateRequest(categoryIdParamSchema), getCategoryById);

// ==========================================
// ADMIN / STAFF ROUTES
// ==========================================
router.use(protect);
router.use(restrictTo('admin', 'staff'));

router.post('/', validateRequest(createCategorySchema), createCategory);
router.patch('/:id', validateRequest(updateCategorySchema), updateCategory);
router.delete('/:id', restrictTo('admin'), validateRequest(categoryIdParamSchema), deleteCategory);

export default router;
