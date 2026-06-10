import { User } from '@/api/v1/models/user.model';
import mongoose from 'mongoose';

class PushNotificationService {
  /**
   * Sends a push notification to a specific user via Expo Push Notification API.
   * Resolves silently on error to prevent crashing payment or database transactions.
   */
  async sendPushNotification(
    userId: string | mongoose.Types.ObjectId,
    title: string,
    body: string,
    data?: Record<string, any>
  ): Promise<void> {
    try {
      // 1. Fetch user to retrieve pushToken
      const user = await User.findById(userId).select('pushToken');
      
      if (!user || !user.pushToken) {
        console.log(`[PushNotification] Skipped: User ${userId} has no registered push token.`);
        return;
      }

      // 2. Validate token structure (Expo tokens start with ExponentPushToken or ExpoPushToken)
      if (!user.pushToken.startsWith('ExponentPushToken') && !user.pushToken.startsWith('ExpoPushToken')) {
        console.warn(`[PushNotification] Skipped: User ${userId} has an invalid token format: ${user.pushToken}`);
        return;
      }

      // 3. Prepare payload for Expo's API
      const payload = {
        to: user.pushToken,
        sound: 'default',
        title,
        body,
        data: data || {},
      };

      console.log(`[PushNotification] Sending push to User ${userId} (${title})...`);

      // 4. Send request to Expo Push service
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Accept-encoding': 'gzip, deflate',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => null);
        console.error(`[PushNotification] Expo API Error: ${response.status} - ${JSON.stringify(errBody)}`);
      } else {
        console.log(`[PushNotification] Push sent successfully to User ${userId}.`);
      }
    } catch (error) {
      console.error(`[PushNotification] Error sending push notification to user ${userId}:`, error);
    }
  }

  /**
   * Sends push notifications to multiple tokens in bulk.
   * Expo recommends sending in chunks of 100.
   */
  async sendBulkPushNotifications(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, any>
  ): Promise<void> {
    try {
      const validTokens = tokens.filter(
        (t) => t && (t.startsWith('ExponentPushToken') || t.startsWith('ExpoPushToken'))
      );

      if (validTokens.length === 0) {
        console.log('[PushNotification] No valid push tokens provided for bulk send.');
        return;
      }

      // Chunk tokens (Expo recommends max 100 per request)
      const chunkSize = 100;
      const chunks = [];
      for (let i = 0; i < validTokens.length; i += chunkSize) {
        chunks.push(validTokens.slice(i, i + chunkSize));
      }

      console.log(`[PushNotification] Sending bulk push to ${validTokens.length} tokens in ${chunks.length} chunks...`);

      for (const chunk of chunks) {
        const messages = chunk.map((token) => ({
          to: token,
          sound: 'default',
          title,
          body,
          data: data || {},
        }));

        const response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Accept-encoding': 'gzip, deflate',
          },
          body: JSON.stringify(messages),
        });

        if (!response.ok) {
          const errBody = await response.json().catch(() => null);
          console.error(`[PushNotification] Bulk Expo API Error: ${response.status} - ${JSON.stringify(errBody)}`);
        }
      }

      console.log('[PushNotification] Bulk push notifications processing complete.');
    } catch (error) {
      console.error('[PushNotification] Error in bulk push notification service:', error);
    }
  }
}

export const pushNotificationService = new PushNotificationService();
