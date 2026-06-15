import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getMessaging, Messaging } from 'firebase-admin/messaging';
import { User } from '@/api/v1/models/user.model';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';

// Initialize Firebase Admin
const serviceAccountPath = path.resolve(process.cwd(), 'firebase-admin.json');
let firebaseApp: App;

if (fs.existsSync(serviceAccountPath)) {
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  const apps = getApps();
  if (!apps.length) {
    firebaseApp = initializeApp({
      credential: cert(serviceAccount),
    });
    console.log('[PushNotification] Firebase Admin initialized successfully.');
  } else {
    firebaseApp = apps[0];
  }
} else {
  console.error('[PushNotification] firebase-admin.json not found. Notifications will not work.');
}

class PushNotificationService {
  /**
   * Sends a push notification to a specific user via Firebase Cloud Messaging.
   */
  async sendPushNotification(
    userId: string | mongoose.Types.ObjectId,
    title: string,
    body: string,
    data?: Record<string, any>
  ): Promise<void> {
    try {
      const user = await User.findById(userId).select('pushToken');
      
      if (!user || !user.pushToken) {
        console.log(`[PushNotification] Skipped: User ${userId} has no registered push token.`);
        return;
      }

      // FCM tokens don't start with Expo/Exponent prefixes
      if (user.pushToken.startsWith('ExponentPushToken') || user.pushToken.startsWith('ExpoPushToken')) {
        console.warn(`[PushNotification] Skipped: User ${userId} has an old Expo token. User needs to login to refresh to FCM token.`);
        return;
      }

      const message = {
        notification: { title, body },
        data: data || {},
        token: user.pushToken,
      };

      console.log(`[PushNotification] Sending FCM push to User ${userId}...`);
      await getMessaging().send(message);
      console.log(`[PushNotification] Success: Push sent to User ${userId}`);
    } catch (error: any) {
      if (error.code === 'messaging/registration-token-not-registered') {
        console.warn(`[PushNotification] Token for User ${userId} is no longer valid. Removing...`);
        await User.findByIdAndUpdate(userId, { $unset: { pushToken: 1 } });
      } else {
        console.error(`[PushNotification] Error sending FCM push to User ${userId}:`, error);
      }
    }
  }

  /**
   * Sends push notifications to multiple tokens in bulk via Firebase.
   */
  async sendBulkPushNotifications(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, any>
  ): Promise<void> {
    try {
      // Filter out old Expo tokens
      const validTokens = tokens.filter(
        (t) => t && !t.startsWith('ExponentPushToken') && !t.startsWith('ExpoPushToken')
      );

      if (validTokens.length === 0) {
        console.log('[PushNotification] No valid FCM tokens provided for bulk send.');
        return;
      }

      const message = {
        notification: { title, body },
        data: data || {},
        tokens: validTokens,
      };

      console.log(`[PushNotification] Sending bulk FCM push to ${validTokens.length} tokens...`);
      const response = await getMessaging().sendEachForMulticast(message);
      
      console.log(`[PushNotification] Bulk Success: ${response.successCount}, Failure: ${response.failureCount}`);
      
      if (response.failureCount > 0) {
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            console.error(`[PushNotification] Bulk failure for token ${validTokens[idx]}:`, resp.error);
          }
        });
      }
    } catch (error) {
      console.error('[PushNotification] Error in bulk FCM service:', error);
    }
  }
}

export const pushNotificationService = new PushNotificationService();