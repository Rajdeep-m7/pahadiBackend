import { Router } from 'express';
import {
  createAddress,
  updateAddress,
  deleteAddress,
  makeDefaultAddress,
  getMyAddresses,
} from '@/api/v1/controllers/address.controller';
import { validateRequest } from '@/api/v1/middlewares/validateRequest.middleware';
import { protect } from '@/api/v1/middlewares/auth.middleware';
import {
  createAddressSchema,
  updateAddressSchema,
  addressIdParamSchema,
} from '@/api/v1/validations/address.validation';

const router = Router();

// ==========================================
// PROTECTED ROUTES (All authenticated users)
// ==========================================
router.use(protect);

router.get('/', getMyAddresses);
router.post('/', validateRequest(createAddressSchema), createAddress);
router.patch('/:id', validateRequest(updateAddressSchema), updateAddress);
router.delete('/:id', validateRequest(addressIdParamSchema), deleteAddress);
router.patch('/:id/default', validateRequest(addressIdParamSchema), makeDefaultAddress);

export default router;
