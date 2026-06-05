import { Router } from 'express';
import {
  createReturnRequest,
  getAllReturnRequests,
  approveReturnRequest,
  rejectReturnRequest,
  markItemReceived,
  resolveReturn,
} from '@/api/v1/controllers/returnReplace.controller';
import { validateRequest } from '@/api/v1/middlewares/validateRequest.middleware';
import { protect, restrictTo } from '@/api/v1/middlewares/auth.middleware';
import {
  createReturnRequestSchema,
  getAllReturnRequestsSchema,
  approveReturnRequestSchema,
  rejectReturnRequestSchema,
  markItemReceivedSchema,
  resolveReturnSchema,
} from '@/api/v1/validations/returnReplace.validation';

const router = Router();

// ==========================================
// CUSTOMER ROUTES
// ==========================================
router.use(protect);

router.post('/', validateRequest(createReturnRequestSchema), createReturnRequest);

// ==========================================
// ADMIN / STAFF ROUTES
// ==========================================
router.use(restrictTo('admin', 'staff'));

router.get('/', validateRequest(getAllReturnRequestsSchema), getAllReturnRequests);
router.patch('/:id/approve', validateRequest(approveReturnRequestSchema), approveReturnRequest);
router.patch('/:id/reject', validateRequest(rejectReturnRequestSchema), rejectReturnRequest);
router.patch('/:id/received', validateRequest(markItemReceivedSchema), markItemReceived);
router.patch('/:id/resolve', validateRequest(resolveReturnSchema), resolveReturn);

export default router;
