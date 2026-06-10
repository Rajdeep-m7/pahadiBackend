import { Response, NextFunction } from 'express';
import { User } from '@/api/v1/models/user.model';
import { Cart } from '@/api/v1/models/cart.model';
import { Wishlist } from '@/api/v1/models/wishlist.model';
import { httpError } from '@/api/v1/utils/httpError';
import httpResponse from '@/api/v1/utils/httpResponse';
import { AuthRequest } from '@/api/v1/interfaces/auth.interface';
import { pushNotificationService } from '@/api/v1/services/pushNotification.service';

/**
 * Send bulk notifications to targeted users.
 * Target options: 'all', 'cart', 'wishlist'
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
