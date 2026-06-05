import { Router } from 'express';
import {
  createWarehouse,
  getWarehouses,
  getWarehouseById,
  updateWarehouse,
  getWarehouseProducts,
  syncWithShiprocket,
} from '@/api/v1/controllers/warehouse.controller';
import { validateRequest } from '@/api/v1/middlewares/validateRequest.middleware';
import { protect, restrictTo } from '@/api/v1/middlewares/auth.middleware';
import {
  createWarehouseSchema,
  updateWarehouseSchema,
  getWarehousesSchema,
  getWarehouseByIdSchema,
  getWarehouseProductsSchema,
} from '@/api/v1/validations/warehouse.validation';

const router = Router();

// ==========================================
// PROTECTED ROUTES (Admin & Staff)
// ==========================================
router.use(protect);
router.use(restrictTo('admin', 'staff'));

router.get('/', validateRequest(getWarehousesSchema), getWarehouses);
router.get('/:id', validateRequest(getWarehouseByIdSchema), getWarehouseById);
router.get('/:id/products', validateRequest(getWarehouseProductsSchema), getWarehouseProducts);

// ==========================================
// ADMIN ONLY ROUTES
// ==========================================
router.use(restrictTo('admin'));

router.post('/sync-with-shiprocket', syncWithShiprocket);
router.post('/', validateRequest(createWarehouseSchema), createWarehouse);
router.patch('/:id', validateRequest(updateWarehouseSchema), updateWarehouse);

export default router;
