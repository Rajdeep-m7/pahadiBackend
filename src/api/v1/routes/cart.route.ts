import { Router } from 'express';
import { getCart, syncCart, clearCart } from '@/api/v1/controllers/cart.controller';
import { validateRequest } from '@/api/v1/middlewares/validateRequest.middleware';
import { protect } from '@/api/v1/middlewares/auth.middleware';
import { syncCartSchema } from '@/api/v1/validations/cart.validation';

const router = Router();

router.use(protect);

router.get('/', getCart);
router.put('/sync', validateRequest(syncCartSchema), syncCart);
router.delete('/', clearCart);

export default router;
