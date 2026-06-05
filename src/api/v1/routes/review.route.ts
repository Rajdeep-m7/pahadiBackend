import { Router } from 'express';
import {
  createReview,
  deleteReview,
  getReviewsByProduct,
  getReviewsByUser,
  getAllReviews,
  updateReview,
  setReviewActiveStatus,
} from '@/api/v1/controllers/review.controller';
import { validateRequest } from '@/api/v1/middlewares/validateRequest.middleware';
import { protect, restrictTo } from '@/api/v1/middlewares/auth.middleware';
import {
  createReviewSchema,
  reviewIdSchema,
  updateReviewSchema,
  reviewActiveSchema,
} from '@/api/v1/validations/review.validation';

const router = Router();

// Public product reviews
router.get('/product/:id', validateRequest(reviewIdSchema), getReviewsByProduct);

router.use(protect);
// Customer review actions
router.post('/product/:id', validateRequest(createReviewSchema), createReview);
router.patch('/:id', validateRequest(updateReviewSchema), updateReview);
router.delete('/:id', validateRequest(reviewIdSchema), deleteReview);
router.get('/user', getReviewsByUser);

// Admin review management
router.use(restrictTo('admin', 'staff')); // Only admins and staff can access the following routes
router.get('/', getAllReviews);
router.patch('/:id/is-active', validateRequest(reviewActiveSchema), setReviewActiveStatus);

export default router;
