import { Router } from 'express';
import { getWishlist, toggleWishlistItem } from '@/api/v1/controllers/wishlist.controller';
import { validateRequest } from '@/api/v1/middlewares/validateRequest.middleware';
import { protect } from '@/api/v1/middlewares/auth.middleware';
import { toggleWishlistSchema } from '@/api/v1/validations/wishlist.validation';

const router = Router();

router.use(protect);

router.get('/', getWishlist);
router.patch('/toggle/:variantId', validateRequest(toggleWishlistSchema), toggleWishlistItem);

export default router;
