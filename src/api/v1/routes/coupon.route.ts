import { Router } from 'express';
import {
  createCoupon,
  getCoupons,
  getAvailableCoupons,
  getCouponById,
  updateCoupon,
  deleteCoupon,
  validateCoupon,
} from '@/api/v1/controllers/coupon.controller';
import { protect, restrictTo } from '@/api/v1/middlewares/auth.middleware';
import { validateRequest } from '@/api/v1/middlewares/validateRequest.middleware';
import {
  createCouponSchema,
  updateCouponSchema,
  getCouponByIdSchema,
  deleteCouponSchema,
  validateCouponSchema,
  getCouponsSchema,
  getAvailableCouponsSchema,
} from '@/api/v1/validations/coupon.validation';

const router = Router();

// ==========================================
// CUSTOMER ROUTES
// ==========================================
router.get('/available', validateRequest(getAvailableCouponsSchema), getAvailableCoupons);
router.get('/validate', protect, validateRequest(validateCouponSchema), validateCoupon);

// ==========================================
// ADMIN ROUTES
// ==========================================
router.use(protect, restrictTo('admin', 'staff'));

router.get('/', validateRequest(getCouponsSchema), getCoupons);
router.post('/', validateRequest(createCouponSchema), createCoupon);
router.get('/:id', validateRequest(getCouponByIdSchema), getCouponById);
router.patch('/:id', validateRequest(updateCouponSchema), updateCoupon);
router.delete('/:id', validateRequest(deleteCouponSchema), deleteCoupon);

export default router;