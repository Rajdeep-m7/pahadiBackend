import mongoose from 'mongoose';
import { Order } from '@/api/v1/models/order.model';
import { Variant } from '@/api/v1/models/variant.model';

/**
 * Polling-based cleanup for expired pending payment orders.
 *
 * Every 1 minute, this checks for orders where:
 * - status is `pending_payment`
 * - paymentExpiresAt < now
 *
 * For each expired order:
 * - Restores stock to variants
 * - Updates status to `payment_expired`
 * - Clears paymentExpiresAt (so we don't process again)
 */

const POLL_INTERVAL_MS = 60 * 1000; // 1 minute

const cleanupExpiredOrders = async () => {
  try {
    const now = new Date();

    // Find all pending orders that have expired
    const expiredOrders = await Order.find({
      orderStatus: 'pending_payment',
      paymentExpiresAt: { $lte: now },
    }).limit(100);

    if (expiredOrders.length === 0) return;

    console.log(`[Order Expiry] Found ${expiredOrders.length} expired orders`);

    for (const order of expiredOrders) {
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        // 1. Restore stock for each item
        for (const item of order.items) {
          await Variant.updateOne(
            { _id: item.variantId },
            { $inc: { stocks: item.quantity } },
            { session }
          );
        }

        // 2. Delete the expired order (not keeping it)
        await Order.deleteOne({ _id: order._id }, { session });

        await session.commitTransaction();
        console.log(`[Order Expiry] Deleted expired order ${order._id}, stock restored`);
      } catch (error) {
        await session.abortTransaction();
        console.error(`[Order Expiry] Error processing order ${order._id}:`, error);
      } finally {
        session.endSession();
      }
    }
  } catch (error) {
    console.error('[Order Expiry] Polling error:', error);
  }
};

export const startOrderExpiryPolling = () => {
  console.log('[Order Expiry] Starting polling service');

  // Run immediately on startup
  cleanupExpiredOrders();

  // Then poll every 1 minute
  setInterval(cleanupExpiredOrders, POLL_INTERVAL_MS);
  console.log(`[Order Expiry] Polling every ${POLL_INTERVAL_MS / 1000} second(s)`);
};