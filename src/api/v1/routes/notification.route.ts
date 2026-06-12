import { Router } from 'express';
import { 
  createNotification, 
  getAllNotifications, 
  cancelNotification 
} from '@/api/v1/controllers/notification.controller';
import { protect, restrictTo } from '@/api/v1/middlewares/auth.middleware';
import { validateRequest } from '@/api/v1/middlewares/validateRequest.middleware';
import { sendNotificationSchema } from '@/api/v1/validations/notification.validation';

const router = Router();

router.use(protect);
router.use(restrictTo('admin', 'staff'));

router.get('/', getAllNotifications);
router.post('/send', validateRequest(sendNotificationSchema), createNotification);
router.delete('/:id', cancelNotification);

export default router;
