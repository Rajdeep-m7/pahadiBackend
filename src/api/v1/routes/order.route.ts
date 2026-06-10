import { Router } from 'express';
import {
  createOrder,
  getMyOrders,
  getOrderById,
  cancelOrder,
  cancelOrderAdmin,
  cancelOrderItem,
  cancelOrderItemAdmin,
  refundOrder,
  refundOrderItemAdmin,
  getAllOrdersAdmin,
  triggerShipRocketDispatch,
  updateOrderStatusAdmin,
  confirmPartialOrder,
  trackOrder,
} from '@/api/v1/controllers/order.controller';
import { validateRequest } from '@/api/v1/middlewares/validateRequest.middleware';
import { protect, restrictTo } from '@/api/v1/middlewares/auth.middleware';
import {
  createOrderSchema,
  getMyOrdersSchema,
  getOrderByIdSchema,
  cancelOrderSchema,
  cancelOrderAdminSchema,
  cancelOrderItemSchema,
  refundOrderSchema,
  getAllOrdersAdminSchema,
  triggerDispatchSchema,
  updateOrderStatusAdminSchema,
  confirmPartialOrderSchema,
  trackOrderSchema,
} from '@/api/v1/validations/order.validation';

const router = Router();

// ==========================================
// CUSTOMER ROUTES (Any authenticated user)
// ==========================================
router.use(protect);

router.post('/', validateRequest(createOrderSchema), createOrder);
router.get('/me', validateRequest(getMyOrdersSchema), getMyOrders);
router.get('/me/:id', validateRequest(getOrderByIdSchema), getOrderById);
router.patch('/me/:id/cancel', validateRequest(cancelOrderSchema), cancelOrder);
router.patch('/me/:id/cancel-item/:itemId', validateRequest(cancelOrderItemSchema), cancelOrderItem);

// ==========================================
// ADMIN / STAFF ROUTES
// ==========================================
router.use(restrictTo('admin', 'staff'));

router.get('/', validateRequest(getAllOrdersAdminSchema), getAllOrdersAdmin);
router.patch('/:id/cancel/admin', validateRequest(cancelOrderAdminSchema), cancelOrderAdmin);
router.patch('/:id/cancel-item/:itemId/admin', validateRequest(cancelOrderItemSchema), cancelOrderItemAdmin);
router.patch('/:id/refund', validateRequest(refundOrderSchema), refundOrder);
router.patch('/:id/refund-item/:itemId', validateRequest(cancelOrderItemSchema), refundOrderItemAdmin);
router.patch('/:id/dispatch', validateRequest(triggerDispatchSchema), triggerShipRocketDispatch);
router.patch('/:id/status', validateRequest(updateOrderStatusAdminSchema), updateOrderStatusAdmin);
router.patch('/:id/confirm-partial', validateRequest(confirmPartialOrderSchema), confirmPartialOrder);
router.get('/:id/track', validateRequest(trackOrderSchema), trackOrder);

export default router;
