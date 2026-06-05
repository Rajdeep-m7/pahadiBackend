import { Router } from 'express';
import {
  initiatePayment,
  verifyPayment,
  razorpayWebhook,
  getAllTransactionsAdmin,
  getTransactionById,
} from '@/api/v1/controllers/transaction.controller';
import { validateRequest } from '@/api/v1/middlewares/validateRequest.middleware';
import { protect, restrictTo } from '@/api/v1/middlewares/auth.middleware';
import {
  initiatePaymentSchema,
  verifyPaymentSchema,
  getAllTransactionsAdminSchema,
  getTransactionByIdSchema,
} from '@/api/v1/validations/transaction.validation';

const router = Router();

// ==========================================
// PUBLIC / SYSTEM ROUTES
// ==========================================

// Webhook must be public as Razorpay hits it
router.post('/webhook', razorpayWebhook);

// ==========================================
// CUSTOMER ROUTES
// ==========================================
router.use(protect);

router.post('/initiate', validateRequest(initiatePaymentSchema), initiatePayment);
router.post('/verify', validateRequest(verifyPaymentSchema), verifyPayment);

// ==========================================
// ADMIN ROUTES
// ==========================================
router.use(restrictTo('admin', 'staff'));

router.get('/', validateRequest(getAllTransactionsAdminSchema), getAllTransactionsAdmin);
router.get('/:id', validateRequest(getTransactionByIdSchema), getTransactionById);

export default router;
