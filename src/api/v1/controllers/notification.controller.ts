import { Response, NextFunction } from 'express';
import { User } from '@/api/v1/models/user.model';
import { Cart } from '@/api/v1/models/cart.model';
import { Wishlist } from '@/api/v1/models/wishlist.model';
import { Notification } from '@/api/v1/models/notification.model';
import { httpError } from '@/api/v1/utils/httpError';
import httpResponse from '@/api/v1/utils/httpResponse';
import { AuthRequest } from '@/api/v1/interfaces/auth.interface';
import { pushNotificationService } from '@/api/v1/services/pushNotification.service';
import agenda from '@/config/agenda';

/**
 * Helper to process and send a notification.
 * This is used by both the controller (for immediate) and Agenda (for scheduled).
 */
export const processNotificationJob = async (notificationId: string) => {
  console.log(`[NotificationProcessor] Processing job for notificationId: ${notificationId}`);
  try {
    const notification = await Notification.findById(notificationId);
    if (!notification) {
      console.error(`[NotificationProcessor] Notification ${notificationId} not found.`);
      return;
    }

    if (notification.status !== 'pending') {
      console.log(`[NotificationProcessor] Notification ${notificationId} is already ${notification.status}. Skipping.`);
      return;
    }

    console.log(`[NotificationProcessor] Sending: ${notification.title} (Target: ${notification.target})`);

    let userIds: any[] = [];

    if (notification.target === 'all') {
      const users = await User.find({ pushToken: { $exists: true, $ne: '' } }).select('_id');
      userIds = users.map(u => u._id);
    } else if (notification.target === 'cart') {
      const carts = await Cart.find({ 'items.0': { $exists: true } }).select('userId');
      userIds = carts.map(c => c.userId);
    } else if (notification.target === 'wishlist') {
      const wishlists = await Wishlist.find({ 'variantIds.0': { $exists: true } }).select('userId');
      userIds = wishlists.map(w => w.userId);
    }

    if (userIds.length === 0) {
      notification.status = 'sent';
      notification.sentAt = new Date();
      notification.sentCount = 0;
      await notification.save();
      console.log(`[NotificationProcessor] No users found for target ${notification.target}. Marked as sent.`);
      return;
    }

    const usersWithTokens = await User.find({ 
      _id: { $in: userIds },
      pushToken: { $exists: true, $ne: '' }
    }).select('pushToken');

    const tokens = usersWithTokens.map(u => u.pushToken as string);

    if (tokens.length > 0) {
      await pushNotificationService.sendBulkPushNotifications(tokens, notification.title, notification.body);
    }

    notification.status = 'sent';
    notification.sentAt = new Date();
    notification.sentCount = tokens.length;
    await notification.save();

    console.log(`[NotificationProcessor] Success. Sent to ${tokens.length} users.`);
  } catch (error) {
    console.error(`[NotificationProcessor] Error processing notification ${notificationId}:`, error);
    await Notification.findByIdAndUpdate(notificationId, { status: 'failed' });
  }
};

/**
 * Get all notifications (paginated for admin table)
 */
export const getAllNotifications = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Debug: Log all agenda jobs to terminal to see when they are scheduled
    const jobs = await agenda.jobs({});
    console.log(`[DEBUG] Current Agenda Jobs in DB (${jobs.length}):`);
    jobs.forEach(j => {
      console.log(`- Job: ${j.attrs.name}, status: ${j.attrs.nextRunAt ? 'scheduled' : 'finished'}, nextRunAt: ${j.attrs.nextRunAt}, lastRunAt: ${j.attrs.lastRunAt}`);
    });

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const notifications = await Notification.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Notification.countDocuments();

    return httpResponse(req, res, 200, 'Notifications fetched successfully', {
      notifications,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: unknown) {
    return httpError(next, error, req, 500);
  }
};

/**
 * Create and schedule a notification
 */
export const createNotification = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { title, body, target, scheduledAt } = req.body;
    console.log(`[NotificationController] Creating notification: ${title}, target: ${target}, scheduledAt: ${scheduledAt}`);

    const notification = await Notification.create({
      title,
      body,
      target,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      status: 'pending',
    });

    if (scheduledAt) {
      const scheduleDate = new Date(scheduledAt);
      console.log(`[NotificationController] Scheduling for: ${scheduleDate.toISOString()}`);
      // Schedule for future using Agenda
      await agenda.schedule(scheduleDate, 'process-notification', { notificationId: notification._id });
    } else {
      console.log('[NotificationController] Processing immediately without Agenda');
      // Process immediately inline
      // We don't await this to avoid blocking the HTTP response, allowing it to run in background
      processNotificationJob(notification._id.toString()).catch(err => {
        console.error('[NotificationController] Background immediate processing failed:', err);
      });
    }

    return httpResponse(req, res, 201, 'Notification created successfully', notification);
  } catch (error: unknown) {
    console.error('[NotificationController] Error:', error);
    return httpError(next, error, req, 500);
  }
};

/**
 * Cancel a pending notification
 */
export const cancelNotification = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findById(id);
    if (!notification) {
      return httpResponse(req, res, 404, 'Notification not found');
    }

    if (notification.status !== 'pending') {
      return httpResponse(req, res, 400, `Cannot cancel notification with status: ${notification.status}`);
    }

    // Cancel the agenda job
    await agenda.cancel({ 'data.notificationId': notification._id });

    notification.status = 'cancelled';
    await notification.save();

    return httpResponse(req, res, 200, 'Notification cancelled successfully', notification);
  } catch (error: unknown) {
    return httpError(next, error, req, 500);
  }
};

/**
 * Send bulk notifications to targeted users.
 * Target options: 'all', 'cart', 'wishlist'
 * @deprecated Use createNotification instead
 */
export const sendBulkNotifications = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { title, body, target } = req.body;

    let userIds: any[] = [];

    if (target === 'all') {
      // Find all users who have a push token
      const users = await User.find({ pushToken: { $exists: true, $ne: '' } }).select('_id');
      userIds = users.map(u => u._id);
    } else if (target === 'cart') {
      // Find users who have items in their cart
      const carts = await Cart.find({ 'items.0': { $exists: true } }).select('userId');
      userIds = carts.map(c => c.userId);
    } else if (target === 'wishlist') {
      // Find users who have items in their wishlist
      const wishlists = await Wishlist.find({ 'variantIds.0': { $exists: true } }).select('userId');
      userIds = wishlists.map(w => w.userId);
    }

    if (userIds.length === 0) {
      return httpResponse(req, res, 200, 'No users found for the selected target.');
    }

    // Fetch tokens for these users
    const usersWithTokens = await User.find({ 
      _id: { $in: userIds },
      pushToken: { $exists: true, $ne: '' }
    }).select('pushToken');

    const tokens = usersWithTokens.map(u => u.pushToken as string);

    if (tokens.length === 0) {
      return httpResponse(req, res, 200, 'No valid push tokens found for the selected target.');
    }

    // Send in bulk (async - don't wait for completion to respond to admin)
    pushNotificationService.sendBulkPushNotifications(tokens, title, body);

    return httpResponse(req, res, 200, `Notification broadcast started for ${tokens.length} users.`);
  } catch (error: unknown) {
    return httpError(next, error, req, 500);
  }
};
