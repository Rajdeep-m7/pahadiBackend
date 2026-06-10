import { Router } from 'express';
import { sendBulkNotifications } from '@/api/v1/controllers/notification.controller';
import { protect, restrictTo } from '@/api/v1/middlewares/auth.middleware';
import { validateRequest } from '@/api/v1/middlewares/validateRequest.middleware';
import { sendNotificationSchema } from '@/api/v1/validations/notification.validation';

const router = Router();

router.use(protect);
router.use(restrictTo('admin', 'staff'));

router.post('/send', validateRequest(sendNotificationSchema), sendBulkNotifications);

export default router;
