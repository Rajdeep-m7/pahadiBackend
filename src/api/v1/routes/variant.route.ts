import express from 'express';
import * as variantController from '@/api/v1/controllers/variant.controller';
import { validateRequest } from '@/api/v1/middlewares/validateRequest.middleware';
import { protect, restrictTo, optionalProtect } from '@/api/v1/middlewares/auth.middleware';
import * as variantValidation from '@/api/v1/validations/variant.validation';

const router = express.Router();

// Public Routes
router.get(
  '/search',
  optionalProtect,
  validateRequest(variantValidation.searchVariantsSchema),
  variantController.searchVariants
);

router.get(
  '/:id',
  optionalProtect,
  validateRequest(variantValidation.variantIdParamSchema),
  variantController.getVariantById
);

router.get(
  '/slug/:slug',
  optionalProtect,
  validateRequest(variantValidation.variantSlugParamSchema),
  variantController.getVariantBySlug
);

// Admin/Staff Routes
router.use(protect);
router.use(restrictTo('admin', 'staff'));

router.post(
  '/',
  validateRequest(variantValidation.createVariantSchema),
  variantController.createVariant
);

router.patch(
  '/:id',
  validateRequest(variantValidation.updateVariantSchema),
  variantController.updateVariant
);

router.patch(
  '/:id/toggle',
  validateRequest(variantValidation.variantIdParamSchema),
  variantController.toggleVariantStatus
);

router.delete(
  '/:id',
  validateRequest(variantValidation.variantIdParamSchema),
  variantController.deleteVariant
);

export default router;
