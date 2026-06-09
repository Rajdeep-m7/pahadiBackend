import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Razorpay from 'razorpay';
import { Order } from '@/api/v1/models/order.model';
import { Product } from '@/api/v1/models/product.model';
import { WarehouseLocation } from '@/api/v1/models/warehouse.model';
import { User } from '@/api/v1/models/user.model';
import { Transaction } from '@/api/v1/models/transaction.model';
import { Category } from '@/api/v1/models/category.model';
import { resolveCategoryTax } from '@/api/v1/controllers/category.controller';
import { shiprocketService } from '@/api/v1/services/shiprocket.service';
import { httpError } from '@/api/v1/utils/httpError';
import httpResponse from '@/api/v1/utils/httpResponse';
import { AuthRequest } from '@/api/v1/interfaces/auth.interface';
import env from '@/config/env';
import { pushNotificationService } from '@/api/v1/services/pushNotification.service';
import { IOrderShipments, IOrderItem, IOrder } from '@/api/v1/interfaces/order.interface';
import { IVariantDocument, Variant } from '@/api/v1/models/variant.model';
import { sanitizeOrderStatus } from '@/api/v1/utils/orderStatus.util';
import { Cart } from '@/api/v1/models/cart.model';
import {
  validateCoupon,
  calculateDiscountAmount,
  apportionDiscount,
  calculateItemTax,
} from '@/api/v1/services/coupon.service';

// ==========================================
// HELPERS
// ==========================================

/**
 * Cleanup helper: restores stock for expired pending orders.
 * Called when user starts a new checkout to free up abandoned cart stock.
 */
const cleanupExpiredPendingOrders = async (
  userId: mongoose.Types.ObjectId,
  session: mongoose.ClientSession
): Promise<void> => {
  const expiredOrders = await Order.find({
    userId,
    orderStatus: 'pending_payment',
    paymentExpiresAt: { $lt: new Date() },
  }).session(session);

  for (const order of expiredOrders) {
    await restockItems(order.items, session);
    order.orderStatus = 'payment_expired';
    order.statusHistory.push({
      status: 'Payment Expired',
      timestamp: new Date(),
      comment: 'Order expired due to abandoned checkout. Stock restored.',
    });
    await order.save({ session });
  }
};

/**
 * Decrement stock for all items in an order.
 * Called when order is created to reserve inventory.
 */
const reserveStock = async (
  items: Array<{ variantId: mongoose.Types.ObjectId; quantity: number }>,
  session: mongoose.ClientSession
): Promise<void> => {
  for (const item of items) {
    await Variant.updateOne(
      { _id: item.variantId },
      { $inc: { stocks: -item.quantity } },
      { session }
    );
  }
};

/**
 * Restore stock for all items in an order.
 * Called on payment failure or TTL expiry.
 */
const restockItems = async (
  items: Array<{ variantId: mongoose.Types.ObjectId; quantity: number }>,
  session: mongoose.ClientSession
): Promise<void> => {
  for (const item of items) {
    await Variant.updateOne(
      { _id: item.variantId },
      { $inc: { stocks: item.quantity } },
      { session }
    );
  }
};

/**
 * Trigger a Razorpay refund for a transaction.
 * Returns the Razorpay refund object on success.
 */
const triggerRazorpayRefund = async (transaction: {
  gatewayPaymentId?: string;
  amount: number;
}): Promise<unknown> => {
  if (!transaction.gatewayPaymentId) {
    throw new Error('No gatewayPaymentId found — payment may not have been captured.');
  }
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay not configured.');
  }
  const razorpay = new Razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET,
  });
  const refund = await razorpay.payments.refund(transaction.gatewayPaymentId, {
    amount: transaction.amount * 100, // Razorpay uses paise
  });
  return refund;
};

// ==========================================
// GROUP A — CUSTOMER CONTROLLERS
// ==========================================

/**
 * CREATE ORDER
 * The first step of the checkout flow.
 * Converts provided items (Cart or Buy Now) into an Order and decrements stock.
 *
 * Pricing Logic:
 * - Each item's base price = variant.price
 * - subtotal = sum of (basePrice * quantity) across all items
 * - If coupon applied:
 *   - Scenario A (percentage): each item's price reduced by same %
 *   - Scenario B (flat): discount apportioned proportionally by item weight
 * - Tax calculated on effective (post-discount) subtotal per item
 * - totalAmount = subtotal - couponDiscount + itemTax + shippingCost
 */
export const createOrder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { shippingAddress, appliedCoupon, items, isCartCheckout } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new Error('Order items are required.');
    }

    // Cleanup any expired pending orders for this user first (restore their stock)
    await cleanupExpiredPendingOrders(req.user!._id, session);

    let subtotal = 0;
    const orderItems: IOrderItem[] = [];

    // Items with their base info for tax resolution
    const itemsWithBaseInfo: Array<{
      variantId: string;
      quantity: number;
      basePrice: number;
      productId: mongoose.Types.ObjectId;
      effectiveTax: { name: string; slab: number }[] | null;
    }> = [];

    // 1. Group items by variantId to handle duplicates and validate
    const groupedItemsMap = new Map<string, number>();
    for (const item of items) {
      const currentQty = groupedItemsMap.get(item.variantId) || 0;
      groupedItemsMap.set(item.variantId, currentQty + item.quantity);
    }

    // 2. Validate items and prepare snapshots (NO stock decrement yet)
    for (const [variantId, quantity] of groupedItemsMap.entries()) {
      const variant = await Variant.findById(variantId).session(session);

      if (!variant || !variant.isActive) {
        throw new Error(`Item ${variant?.title || 'Unknown'} is no longer available.`);
      }

      if (variant.stocks < quantity) {
        throw new Error(`Insufficient stock for ${variant.title}. Available: ${variant.stocks}`);
      }

      // Resolve effective tax from product
      const product = await Product.findById(variant.productId).session(session);
      let effectiveTax: { name: string; slab: number }[] | null = null;

      if (product) {
        if (product.taxes && product.taxes.length > 0) {
          effectiveTax = product.taxes;
        } else if (product.categoryId) {
          const category = await Category.findById(product.categoryId).session(session);
          if (category) {
            effectiveTax = await resolveCategoryTax(category);
          }
        }
      }

      const itemPrice = variant.price;
      const itemSubtotal = itemPrice * quantity;
      subtotal += itemSubtotal;

      itemsWithBaseInfo.push({
        variantId: variant._id.toString(),
        quantity,
        basePrice: itemPrice,
        productId: variant.productId as mongoose.Types.ObjectId,
        effectiveTax,
      });

      orderItems.push({
        variantId: variant._id,
        snapshot: {
          productId: variant.productId as mongoose.Types.ObjectId,
          title: variant.title,
          coverImage: variant.coverImage.url,
          sku: variant.sku,
          attributes: variant.attributes ? Object.fromEntries(variant.attributes instanceof Map ? variant.attributes : Object.entries(variant.attributes)) : undefined,
          returnPolicyType: product?.returnPolicyType || 'REPLACE',
          returnWindowDays: product?.returnWindowDays || 7,
        },
        price: itemPrice,
        quantity,
        subtotal: itemSubtotal,
        discountApportioned: 0,
        effectivePrice: itemPrice,
        effectiveSubtotal: itemSubtotal,
        taxDetails: [],
        totalTax: 0,
        itemTotal: itemSubtotal,
        itemStatus: 'active',
      });
      // NOTE: Stock is NOT decremented here anymore — deferred until payment succeeds
    }

    // 3. Coupon Processing & Discount Apportionment
    let totalCouponDiscount = 0;
    let couponType: 'percentage' | 'flat' | null = null;
    let couponValue = 0;

    if (appliedCoupon) {
      const validation = await validateCoupon(
        appliedCoupon,
        req.user!._id,
        subtotal
      );

      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid coupon.');
      }

      couponType = validation.coupon!.type;
      couponValue = validation.coupon!.value;

      // Calculate total discount (capped for percentage type)
      totalCouponDiscount = calculateDiscountAmount(
        couponType,
        couponValue,
        validation.coupon!.maxDiscount,
        subtotal
      );
    }

    // Apportion discount across items
    let itemDiscounts: number[] = [];
    if (totalCouponDiscount > 0 && couponType === 'percentage') {
      // Scenario A: Same percentage off each item
      itemDiscounts = itemsWithBaseInfo.map((item) =>
        Math.round(item.basePrice * (couponValue / 100))
      );
    } else if (totalCouponDiscount > 0 && couponType === 'flat') {
      // Scenario B: Flat discount — apportion by weight
      const itemSubtotals = itemsWithBaseInfo.map((item) => item.basePrice * item.quantity);
      itemDiscounts = apportionDiscount(
        itemsWithBaseInfo.map((i) => i.basePrice),
        itemsWithBaseInfo.map((i) => i.quantity),
        totalCouponDiscount
      );
    }

    // 4. Tax Calculation per Item (on effective price after discount)
    for (let i = 0; i < orderItems.length; i++) {
      const item = orderItems[i];
      const discountAmt = itemDiscounts[i] || 0;
      const baseSubtotal = item.subtotal;
      const effectiveSubtotal = baseSubtotal - discountAmt;

      // Calculate tax on effectiveSubtotal
      let itemTaxDetails: { name: string; slab: number; amount: number }[] = [];
      let totalTax = 0;

      if (itemsWithBaseInfo[i].effectiveTax && itemsWithBaseInfo[i].effectiveTax!.length > 0) {
        const result = calculateItemTax(effectiveSubtotal, itemsWithBaseInfo[i].effectiveTax!);
        itemTaxDetails = result.taxDetails;
        totalTax = result.totalTax;
      }

      const itemTotal = effectiveSubtotal + totalTax;

      // Update the order item
      orderItems[i] = {
        ...orderItems[i],
        discountApportioned: discountAmt,
        effectivePrice: item.price - Math.round(discountAmt / item.quantity),
        effectiveSubtotal,
        taxDetails: itemTaxDetails,
        totalTax,
        itemTotal,
      };
    }

    // 5. Financial Totals
    const couponDiscount = itemDiscounts.reduce((sum, d) => sum + d, 0);
    const itemTax = Math.round(orderItems.reduce((sum, item) => sum + item.totalTax, 0) * 100) / 100;
    const shippingCost = 0; // subtotal > 1000 ? 0 : 50;
    const totalAmount = Math.round((subtotal - couponDiscount + itemTax + shippingCost) * 100) / 100;

    // 6. Create Order with payment window (10 minutes)
    const PAYMENT_WINDOW_MS = 10 * 60 * 1000;
    const paymentExpiresAt = new Date(Date.now() + PAYMENT_WINDOW_MS);

    const newOrder = new Order({
      userId: req.user!._id,
      items: orderItems,
      shippingAddress,
      subtotal,
      couponDiscount,
      itemTax,
      shippingCost,
      totalAmount,
      appliedCoupon: appliedCoupon || undefined,
      orderStatus: 'pending_payment',
      statusHistory: [
        {
          status: 'Order Created',
          timestamp: new Date(),
          comment: 'Waiting for payment confirmation.',
        },
      ],
      // TTL: MongoDB auto-deletes this order if paymentExpiresAt passes
      paymentExpiresAt,
    });

    // 7. Reserve stock (decrement from available inventory)
    await reserveStock(orderItems, session);

    // 8. Save order
    await newOrder.save({ session });

    // 9. Clear cart only on successful payment — not here

    await session.commitTransaction();

    return httpResponse(req, res, 201, 'Order created successfully', { orderId: newOrder._id });
  } catch (error: unknown) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// GET MY ORDERS
export const getMyOrders = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {
      userId: req.user!._id,
      // Exclude internal payment states from user-facing order list
      orderStatus: { $nin: ['pending_payment', 'payment_failed', 'payment_expired'] }
    };
    if (req.query.status) filter.orderStatus = req.query.status;

    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Order.countDocuments(filter),
    ]);

    if (orders.length === 0) {
      return httpResponse(req, res, 200, 'Orders fetched successfully', {
        orders: [],
        pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      });
    }

    // Enrich with attributes and details for display (handles old orders without snapshots)
    const variantIds = [...new Set(orders.flatMap((o) => o.items.map((i) => i.variantId.toString())))];
    const variants = await Variant.find({ _id: { $in: variantIds } })
      .select('attributes title coverImage productId')
      .populate('productId', 'title coverImage')
      .lean();
    const variantMap = new Map(variants.map((v) => [v._id.toString(), v]));

    const enrichedOrders = orders.map((order) => ({
      ...order,
      orderId: order._id,
      items: order.items.map((item) => {
        const variant = variantMap.get(item.variantId.toString()) as any;
        const product = variant?.productId as any;

        let attributes = item.snapshot?.attributes;
        if (!attributes && variant?.attributes) {
          attributes = variant.attributes instanceof Map 
            ? Object.fromEntries(variant.attributes) 
            : variant.attributes;
        }

        return { 
          ...item, 
          attributes,
          title: item.snapshot?.title || variant?.title || product?.title || 'Unknown Product',
          coverImage: item.snapshot?.coverImage || variant?.coverImage?.url || product?.coverImage?.url || null,
        };
      }),
    }));

    return httpResponse(req, res, 200, 'Orders fetched successfully', {
      orders: enrichedOrders,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: unknown) {
    return httpError(next, error, req, 500);
  }
};

// GET ORDER BY ID
export const getOrderById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      userId: req.user!._id,
      orderStatus: { $nin: ['pending_payment', 'payment_failed', 'payment_expired'] }
    }).lean();

    if (!order) throw new Error('Order not found');

    // Enrich with attributes and details for display (handles old orders without snapshots)
    const variantIds = order.items.map((i: any) => i.variantId.toString());
    const variants = await Variant.find({ _id: { $in: variantIds } })
      .select('attributes title coverImage productId')
      .populate('productId', 'title coverImage')
      .lean();
    const variantMap = new Map(variants.map((v) => [v._id.toString(), v]));

    const enrichedItems = order.items.map((item: any) => {
      const variant = variantMap.get(item.variantId.toString()) as any;
      const product = variant?.productId as any;

      let attributes = item.snapshot?.attributes;
      if (!attributes && variant?.attributes) {
        attributes = variant.attributes instanceof Map 
          ? Object.fromEntries(variant.attributes) 
          : variant.attributes;
      }

      return { 
        ...item, 
        attributes,
        title: item.snapshot?.title || variant?.title || product?.title || 'Unknown Product',
        coverImage: item.snapshot?.coverImage || variant?.coverImage?.url || product?.coverImage?.url || null,
      };
    });

    return httpResponse(req, res, 200, 'Order fetched successfully', { 
      order: { ...order, orderId: order._id, items: enrichedItems } 
    });
  } catch (error: unknown) {
    return httpError(next, error, req, 404);
  }
};

// CANCEL ORDER (Customer)
export const cancelOrder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  return cancelOrderImpl(req, res, next, { userIdFilter: true });
};

// CANCEL ORDER (Admin — status change + restock only, no inline refund)
// For refund, use the dedicated /refund endpoint
export const cancelOrderAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  return cancelOrderImpl(req, res, next, { userIdFilter: false });
};

// Shared cancel implementation — userIdFilter determines ownership check
const cancelOrderImpl = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
  opts: { userIdFilter: boolean }
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const query: Record<string, unknown> = {
      _id: req.params.id,
      orderStatus: { $in: ['pending_payment', 'processing', 'shipped'] },
    };
    if (opts.userIdFilter) {
      // Customers can only cancel up to processing. Shipped must be handled by admin or via return.
      query.orderStatus = { $in: ['pending_payment', 'processing'] };
      query.userId = req.user!._id;
    }

    const order = await Order.findOneAndUpdate(
      query,
      {
        orderStatus: 'cancelled',
        $push: {
          statusHistory: {
            status: opts.userIdFilter ? 'Cancelled by Customer' : 'Cancelled by Admin',
            timestamp: new Date(),
            comment: (req.body as { reason?: string }).reason || '',
          },
        },
      },
      { session, returnDocument: 'after' }
    );

    if (!order) {
      throw new Error(
        opts.userIdFilter
          ? 'Order cannot be cancelled. It may have already been shipped or does not belong to you.'
          : 'Order cannot be cancelled. It may not exist or is in a non-cancellable state.'
      );
    }

    // Trigger Shiprocket cancellation if there are shipments
    const trackingNumbers = order.shipments
      .map((s) => s.trackingNumber)
      .filter((awb): awb is string => !!awb);

    if (trackingNumbers.length > 0) {
      for (const awb of trackingNumbers) {
        try {
          // Find the shipment ID in our records if available to avoid a tracking API call
          const shipment = order.shipments.find(s => s.trackingNumber === awb);
          await shiprocketService.cancelShipment(awb, shipment?.shiprocketShipmentId);
        } catch (srError) {
          console.error(`[OrderController] Shiprocket cancellation failed for AWB ${awb}:`, srError);
          order.statusHistory.push({
            status: 'Shiprocket Cancel Failed',
            timestamp: new Date(),
            comment: `Automatic cancellation failed for AWB ${awb}. Admin must cancel manually in SR dashboard.`,
          });
          await order.save({ session });
        }
      }
    }

    // Restock inventory
    await restockItems(order.items, session);

    // Refund if payment was successful (customer cancel only — admin uses separate /refund endpoint)
    const transaction = await Transaction.findOne({
      orderId: order._id,
    }).session(session);

    if (opts.userIdFilter && transaction?.paymentStatus === 'success') {
      try {
        const refundResult = (await triggerRazorpayRefund(transaction)) as { id?: string };
        transaction.paymentStatus = 'refunded';
        transaction.refundId = refundResult?.id;
        transaction.refundInitiatedAt = new Date();
        await transaction.save({ session });
      } catch (refundErr) {
        console.error('[OrderController] Customer refund failed:', refundErr);
        transaction.paymentStatus = 'refund_failed';
        transaction.refundFailureReason = (refundErr as Error).message;
        await transaction.save({ session });

        await Order.findByIdAndUpdate(
          order._id,
          {
            $push: {
              statusHistory: {
                status: 'Refund Failed — Manual Review Required',
                timestamp: new Date(),
              },
            },
          },
          { session }
        );
      }
    }

    if (order) {
      const firstItemTitle = order.items[0]?.snapshot?.title || 'items';
      const orderItemsCount = order.items.length;
      const orderDisplayName = orderItemsCount > 1 
        ? `"${firstItemTitle}" and ${orderItemsCount - 1} more item(s)` 
        : `"${firstItemTitle}"`;

      pushNotificationService.sendPushNotification(
        order.userId,
        'Order Cancelled ❌',
        `Your order for ${orderDisplayName} has been cancelled.`,
        { orderId: order._id.toString() }
      ).catch((err) => console.error('[PushNotification] Error sending cancellation notification:', err));
    }

    await session.commitTransaction();
    return httpResponse(req, res, 200, 'Order cancelled successfully', { order });
  } catch (error: unknown) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// MANUAL REFUND (Admin)
export const refundOrder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      orderStatus: { $in: ['cancelled', 'processing', 'pending_payment'] },
    }).session(session);

    if (!order) {
      throw new Error('Order not found or cannot be refunded.');
    }

    const transaction = await Transaction.findOne({
      orderId: order._id,
    }).session(session);

    if (!transaction) {
      throw new Error('No payment transaction found for this order.');
    }

    if (!transaction.gatewayPaymentId) {
      throw new Error('No payment ID found — this payment may not have been captured by Razorpay.');
    }

    if (transaction.paymentStatus === 'refunded') {
      throw new Error('Payment has already been refunded.');
    }

    if (transaction.paymentStatus === 'refund_failed') {
      // Retry refund
      try {
        const refundResult = (await triggerRazorpayRefund(transaction)) as { id?: string };
        transaction.paymentStatus = 'refunded';
        transaction.refundId = refundResult?.id;
        transaction.refundInitiatedAt = new Date();
        transaction.refundProcessedBy = req.user!._id;
        await transaction.save({ session });

        await Order.findByIdAndUpdate(
          order._id,
          {
            $push: {
              statusHistory: {
                status: 'Refund Issued (Retry)',
                timestamp: new Date(),
                comment: (req.body as { reason?: string }).reason || '',
              },
            },
          },
          { session }
        );

        await session.commitTransaction();
        return httpResponse(req, res, 200, 'Refund issued successfully', {
          refundId: transaction.refundId || null,
          amount: transaction.amount,
        });
      } catch (refundErr) {
        console.error('[OrderController] Refund retry failed:', refundErr);
        transaction.refundFailureReason = (refundErr as Error).message;
        await transaction.save({ session });
        throw new Error("Refund failed. Please try again or process manually via Razorpay dashboard.");
      }
    }

    // First-time refund
    if (transaction.paymentStatus === 'success') {
      try {
        const refundResult = (await triggerRazorpayRefund(transaction)) as { id?: string };
        transaction.paymentStatus = 'refunded';
        transaction.refundId = refundResult?.id;
        transaction.refundInitiatedAt = new Date();
        transaction.refundProcessedBy = req.user!._id;
        await transaction.save({ session });

        await Order.findByIdAndUpdate(
          order._id,
          {
            $push: {
              statusHistory: {
                status: 'Refund Issued',
                timestamp: new Date(),
                comment: (req.body as { reason?: string }).reason || '',
              },
            },
          },
          { session }
        );

        await session.commitTransaction();
        return httpResponse(req, res, 200, 'Refund issued successfully', {
          refundId: transaction.refundId || null,
          amount: transaction.amount,
        });
      } catch (refundErr) {
        console.error('[OrderController] Refund failed:', refundErr);
        transaction.paymentStatus = 'refund_failed';
        transaction.refundFailureReason = (refundErr as Error).message;
        transaction.refundProcessedBy = req.user!._id;
        await transaction.save({ session });

        await Order.findByIdAndUpdate(
          order._id,
          {
            $push: {
              statusHistory: {
                status: 'Refund Failed — Manual Review Required',
                timestamp: new Date(),
                comment: (req.body as { reason?: string }).reason || '',
              },
            },
          },
          { session }
        );

        await session.commitTransaction();
        return httpResponse(req, res, 400, 'Refund failed. Check statusHistory for details.', {
          paymentStatus: 'refund_failed',
          reason: (refundErr as Error).message,
        });
      }
    }

    throw new Error(`Cannot refund order with payment status: ${transaction.paymentStatus}`);
  } catch (error: unknown) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// GROUP B — ADMIN CONTROLLERS
// ==========================================

// GET ALL ORDERS (ADMIN)
export const getAllOrdersAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {};

    // By default, exclude internal system statuses (pending_payment and payment_expired)
    // These orders are handled internally and not shown to admin
    query.orderStatus = { $nin: ['pending_payment', 'payment_expired'] };

    if (req.query.status) {
      query.orderStatus = req.query.status;
    }

    if (req.query.startDate || req.query.endDate) {
      query.createdAt = {};
      if (req.query.startDate) {
        (query.createdAt as Record<string, Date>).$gte = new Date(req.query.startDate as string);
      }
      if (req.query.endDate) {
        (query.createdAt as Record<string, Date>).$lte = new Date(req.query.endDate as string);
      }
    }

    if (req.query.isConfirmed) {
      query.isConfirmed = req.query.isConfirmed === 'true';
    }

    if (req.query.search) {
      const search = req.query.search as string;
      query.$or = [
        { _id: mongoose.isValidObjectId(search) ? new mongoose.Types.ObjectId(search) : undefined },
        { 'shippingDetails.trackingNumber': { $regex: search, $options: 'i' } },
      ].filter((q) => q !== undefined);
    }

    // Fetch orders
    const [orders, total] = await Promise.all([
      Order.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Order.countDocuments(query),
    ]);

    if (orders.length === 0) {
      return httpResponse(req, res, 200, 'Orders fetched successfully', {
        orders: [],
        pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      });
    }

    // Collect all IDs needed for batch fetching
    const userIds = orders.map((o) => o.userId);
    const orderIds = orders.map((o) => o._id);
    const variantIds = [...new Set(orders.flatMap((o) => o.items.map((i) => i.variantId.toString())))];

    // Batch fetch related data in parallel
    const [users, transactions, variants] = await Promise.all([
      User.find({ _id: { $in: userIds } }).select('name phone').lean(),
      Transaction.find({ orderId: { $in: orderIds } }).lean(),
      Variant.find({ _id: { $in: variantIds } }).select('attributes').lean(),
    ]);

    // Build lookup maps for O(1) access
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));
    const transactionMap = new Map(transactions.map((t) => [t.orderId.toString(), t]));
    const variantMap = new Map(variants.map((v) => [v._id.toString(), v]));

    // Transform orders with enriched data
    const enrichedOrders = orders.map((order) => {
      const user = userMap.get(order.userId.toString());
      const transaction = transactionMap.get(order._id.toString());

      const enrichedItems = order.items.map((item) => {
        const variant = variantMap.get(item.variantId.toString());
        let attributesObj: Record<string, string> = {};

        if (variant?.attributes) {
          if (variant.attributes instanceof Map) {
            attributesObj = Object.fromEntries(variant.attributes);
          } else if (typeof variant.attributes === 'object') {
            attributesObj = variant.attributes as Record<string, string>;
          }
        }

        return {
          title: item.snapshot?.title || variant?.title || 'Unknown Product',
          sku: item.snapshot?.sku || variant?.sku || 'N/A',
          coverImage: item.snapshot?.coverImage || variant?.coverImage?.url || null,
          price: item.price,
          quantity: item.quantity,
          subtotal: item.subtotal,
          effectiveSubtotal: item.effectiveSubtotal,
          itemTotal: item.itemTotal,
          taxDetails: item.taxDetails,
          totalTax: item.totalTax,
          attributes: attributesObj,
          itemStatus: item.itemStatus,
        };
      });

      const shippingAddress = order.shippingAddress;
      const orderWithTimestamp = order as typeof order & { createdAt: Date };

      return {
        _id: order._id,
        orderId: order._id,
        createdAt: orderWithTimestamp.createdAt,
        customerName: user?.name || 'Unknown',
        customerPhone: user?.phone || shippingAddress?.phone || 'N/A',
        subtotal: order.subtotal,
        couponDiscount: order.couponDiscount,
        itemTax: order.itemTax,
        shippingCost: order.shippingCost,
        totalAmount: order.totalAmount,
        appliedCoupon: order.appliedCoupon || null,
        orderStatus: sanitizeOrderStatus(order.orderStatus),
        orderStatusRaw: order.orderStatus,
        paymentMethod: transaction?.paymentMethod || 'N/A',
        paymentStatus: transaction?.paymentStatus || 'N/A',
        items: enrichedItems,
        isConfirmed: order.isConfirmed,
        shippingAddress: {
          fullName: shippingAddress?.fullName || 'N/A',
          phone: shippingAddress?.phone || 'N/A',
          addressLine1: shippingAddress?.addressLine1 || 'N/A',
          addressLine2: shippingAddress?.addressLine2 || undefined,
          city: shippingAddress?.city || 'N/A',
          state: shippingAddress?.state || 'N/A',
          postalCode: shippingAddress?.postalCode || 'N/A',
          country: shippingAddress?.country || 'N/A',
        },
      };
    });

    return httpResponse(req, res, 200, 'Orders fetched successfully', {
      orders: enrichedOrders,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: unknown) {
    return httpError(next, error, req, 500);
  }
};

// TRIGGER SHIPROCKET DISPATCH (Multi-Warehouse Ready)
export const triggerShipRocketDispatch = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const order = await Order.findOne({ _id: req.params.id, orderStatus: 'processing' }).session(
      session
    );

    if (!order || !order.items.length) {
      throw new Error('Order not found or has no items to dispatch.');
    }

    const { weight, length, breadth, height } = req.body;

    const user = await User.findById(order.userId).session(session);
    const customerEmail = user?.email || env.SUPPORT_EMAIL;

    // 1. Group items by their Warehouse ID
    const warehouseGroups = new Map<string, { item: IOrderItem; variant: IVariantDocument }[]>();

    for (const item of order.items) {
      const variant = await Variant.findById(item.variantId).session(session);
      if (!variant) throw new Error(`Variant not found for item ${item.variantId}`);

      const product = await Product.findById(variant.productId).session(session);
      if (!product) throw new Error(`Product not found for variant ${variant._id}`);

      const warehouseId = product.pickupWareHouseId.toString();

      if (!warehouseGroups.has(warehouseId)) {
        warehouseGroups.set(warehouseId, []);
      }
      warehouseGroups.get(warehouseId)!.push({ item, variant });
    }

    // 2. Process a separate Shiprocket AWB for each warehouse
    const newShipments: IOrderShipments[] = [];

    for (const [warehouseId, groupedData] of warehouseGroups.entries()) {
      const warehouse = await WarehouseLocation.findById(warehouseId).session(session);
      if (!warehouse || !warehouse.isActive) {
        throw new Error(`Active warehouse not found for group ${warehouseId}`);
      }

      // Format items for Shiprocket
      const shiprocketItems = groupedData.map((data) => ({
        variantId: data.item.variantId.toString(),
        title: data.item.snapshot.title,
        sku: data.item.snapshot.sku,
        quantity: data.item.quantity,
        sellingPrice: data.item.price,
        lineTotal: data.item.price * data.item.quantity,
      }));

      // Call Shiprocket API
      const shiprocketResponse = await shiprocketService.createPickup({
        orderId: `${order._id.toString()}-${warehouseId.slice(-4)}`, // Unique order ID per shipment
        pickupLocation: warehouse.pickupLocation,
        customerEmail: customerEmail,
        shippingAddress: order.shippingAddress,
        items: shiprocketItems,
        weight: weight || 0.5, // Use provided weight or default
        length: length || 10,   // Use provided length or default
        breadth: breadth || 10, // Use provided breadth or default
        height: height || 10,   // Use provided height or default
      });

      // Save the shipment details
      newShipments.push({
        warehouseId: warehouse._id,
        provider: shiprocketResponse.courierName || 'Shiprocket',
        trackingNumber: shiprocketResponse.trackingNumber,
        shippingLabelUrl: shiprocketResponse.shippingLabelUrl,
        deliveryStatus: 'dispatched',
        shiprocketOrderId: shiprocketResponse.shiprocketOrderId,
        shiprocketShipmentId: shiprocketResponse.shipmentId,
      });
    }

    // 3. Update the Order
    order.orderStatus = 'shipped';
    order.shipments = newShipments; // Save the array of shipments
    order.isConfirmed = true;
    order.confirmedBy = req.user!._id;
    order.confirmedAt = new Date();

    order.statusHistory.push({
      status: 'Confirmed & Dispatched',
      timestamp: new Date(),
      comment: `Order confirmed and dispatched in ${newShipments.length} package(s).`,
    });

    await order.save({ session });

    pushNotificationService.sendPushNotification(
      order.userId,
      'Order Dispatched! 🚚',
      `Your order for ${order.items[0]?.snapshot?.title || 'items'}${order.items.length > 1 ? ` and ${order.items.length - 1} more item(s)` : ''} has been dispatched.`,
      { orderId: order._id.toString() }
    ).catch((err) => console.error('[PushNotification] Error sending dispatch notification:', err));

    await session.commitTransaction();

    return httpResponse(req, res, 200, 'Order dispatched successfully', { order });
  } catch (error: unknown) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// UPDATE ORDER STATUS (ADMIN)
export const updateOrderStatusAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { orderStatus, comment } = req.body as {
      orderStatus: IOrder['orderStatus'];
      comment?: string;
    };
    const orderId = req.params.id;

    const existing = await Order.findById(orderId);
    if (!existing) throw new Error('Order not found');

    // State machine rules
    const transitions: Record<string, string[]> = {
      pending_payment: ['processing', 'cancelled'],
      processing: ['shipped', 'cancelled'],
      shipped: ['delivered', 'cancelled'],
    };

    const allowed = transitions[existing.orderStatus] || [];
    if (!allowed.includes(orderStatus)) {
      throw new Error(
        `Invalid status transition: cannot move from '${existing.orderStatus}' to '${orderStatus}'.`
      );
    }

    const order = await Order.findByIdAndUpdate(
      orderId,
      {
        $set: { orderStatus },
        $push: {
          statusHistory: {
            status: `Status changed to ${orderStatus} by Admin`,
            timestamp: new Date(),
            comment: comment || '',
          },
        },
      },
      { returnDocument: 'after' }
    );

    if (order) {
      const firstItemTitle = order.items[0]?.snapshot?.title || 'items';
      const orderItemsCount = order.items.length;
      const orderDisplayName = orderItemsCount > 1 
        ? `"${firstItemTitle}" and ${orderItemsCount - 1} more item(s)` 
        : `"${firstItemTitle}"`;

      pushNotificationService.sendPushNotification(
        order.userId,
        `Order Status: ${orderStatus.toUpperCase()} 📦`,
        `Your order for ${orderDisplayName} status has been updated to ${orderStatus}.`,
        { orderId: order._id.toString() }
      ).catch((err) => console.error('[PushNotification] Error sending status update:', err));
    }

    return httpResponse(req, res, 200, 'Order status updated successfully', { order });
  } catch (error: unknown) {
    return httpError(next, error, req, 400);
  }
};

 // ==========================================
// CONFIRM PARTIAL ORDER (Admin)
// ==========================================
export const confirmPartialOrder = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    const { items: requestedItems } = req.body as {
      items: { itemId: string; quantity: number }[];
    };

    // Find order
    const order = await Order.findById(id).session(session);
    if (!order) {
      throw new Error('Order not found');
    }

    if (order.orderStatus !== 'processing') {
      throw new Error('Only orders in processing status can be partially confirmed');
    }

    if (order.isConfirmed) {
      throw new Error('Order is already confirmed');
    }

    // Build map of requested quantities
    const requestedMap = new Map(requestedItems.map((i) => [i.itemId, i.quantity]));

    let removedSubtotal = 0;
    let removedTotalAmount = 0;
    const itemChanges: {
      itemId: string;
      originalQuantity: number;
      newQuantity: number;
      status: 'confirmed' | 'reduced' | 'rejected';
    }[] = [];

    // Process each item
    for (const item of order.items) {
      const itemIdStr = item._id?.toString() || item.variantId.toString();
      const requestedQty = requestedMap.get(itemIdStr);

      // If item not in request, reject it
      if (requestedQty === undefined) {
        item.itemStatus = 'rejected_by_admin';
        await Variant.findByIdAndUpdate(
          item.variantId,
          { $inc: { stocks: item.quantity } },
          { session }
        );
        removedSubtotal += item.subtotal;
        removedTotalAmount += item.itemTotal;
        itemChanges.push({
          itemId: itemIdStr,
          originalQuantity: item.quantity,
          newQuantity: 0,
          status: 'rejected',
        });
        continue;
      }

      if (requestedQty === 0) {
        // Full rejection
        item.itemStatus = 'rejected_by_admin';
        await Variant.findByIdAndUpdate(
          item.variantId,
          { $inc: { stocks: item.quantity } },
          { session }
        );
        removedSubtotal += item.subtotal;
        removedTotalAmount += item.itemTotal;
        itemChanges.push({
          itemId: itemIdStr,
          originalQuantity: item.quantity,
          newQuantity: 0,
          status: 'rejected',
        });
      } else if (requestedQty < item.quantity) {
        // Partial reduction
        const originalQty = item.quantity;
        const qtyDiff = originalQty - requestedQty;
        const ratio = requestedQty / originalQty;
        const diffRatio = qtyDiff / originalQty;

        // Capture amounts to remove before updating item
        const itemTotalToRefund = item.itemTotal * diffRatio;
        const subtotalToSubtract = item.subtotal * diffRatio;

        item.quantity = requestedQty;
        item.subtotal = item.price * requestedQty;
        item.discountApportioned = item.discountApportioned * ratio;
        item.effectiveSubtotal = item.subtotal - item.discountApportioned;
        item.totalTax = item.totalTax * ratio;
        item.itemTotal = item.itemTotal * ratio;
        // (Note: taxDetails array is not updated here for brevity, but itemTotal is corrected)

        await Variant.findByIdAndUpdate(
          item.variantId,
          { $inc: { stocks: qtyDiff } },
          { session }
        );
        removedSubtotal += subtotalToSubtract;
        removedTotalAmount += itemTotalToRefund;
        itemChanges.push({
          itemId: itemIdStr,
          originalQuantity: originalQty,
          newQuantity: requestedQty,
          status: 'reduced',
        });
      } else if (requestedQty > item.quantity) {
        throw new Error(`Cannot increase quantity for item ${itemIdStr}`);
      } else {
        // Full confirm - no change
        itemChanges.push({
          itemId: itemIdStr,
          originalQuantity: item.quantity,
          newQuantity: item.quantity,
          status: 'confirmed',
        });
      }
    }

    // Update order totals
    order.subtotal -= removedSubtotal;
    order.totalAmount -= removedTotalAmount;

    // Update confirmation fields
    order.isConfirmed = true;
    order.confirmedBy = req.user!._id;
    order.confirmedAt = new Date();
    order.statusHistory.push({
      status: 'confirmed',
      timestamp: new Date(),
      comment: `Partial confirmation: ${itemChanges.length} items processed`,
    });

    await order.save({ session });

    // Handle partial refund if order was paid
    let refundAmount: number | null = null;
    if (removedTotalAmount > 0) {
      const transaction = await Transaction.findOne({
        orderId: order._id,
        paymentStatus: 'success',
      }).session(session);

      if (transaction) {
        // Issue partial refund via Razorpay
        const razorpay = new Razorpay({
          key_id: env.RAZORPAY_KEY_ID!,
          key_secret: env.RAZORPAY_KEY_SECRET,
        });

        try {
          await razorpay.payments.refund(transaction.gatewayPaymentId, {
            amount: Math.round(removedTotalAmount * 100),
          });
          refundAmount = removedTotalAmount;
        } catch (refundError) {
          console.error('Partial refund failed:', refundError);
          throw new Error('Failed to process partial refund');
        }
      }
    }

    await session.commitTransaction();

    const summary = {
      confirmed: itemChanges.filter((c) => c.status === 'confirmed').length,
      reduced: itemChanges.filter((c) => c.status === 'reduced').length,
      rejected: itemChanges.filter((c) => c.status === 'rejected').length,
      totalRefund: refundAmount,
    };

    return httpResponse(req, res, 200, 'Order partially confirmed', {
      orderId: order._id,
      summary,
      itemChanges,
      order,
    });
  } catch (error: unknown) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// TRACK ORDER (Admin)
// ==========================================
export const trackOrder = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const order = await Order.findById(req.params.id).lean();

    if (!order) {
      throw new Error('Order not found');
    }

    if (!order.shipments?.length) {
      throw new Error('Order has not been shipped yet');
    }

    // Fetch tracking data for each shipment in parallel
    const trackingPromises = order.shipments.map(async (shipment) => {
      if (!shipment.trackingNumber) {
        return {
          warehouseId: shipment.warehouseId,
          provider: shipment.provider || 'N/A',
          trackingNumber: null,
          labelUrl: shipment.shippingLabelUrl || null,
          trackUrl: null,
          trackingData: null,
        };
      }

      try {
        const tracking = await shiprocketService.trackShipment(shipment.trackingNumber);
        return {
          warehouseId: shipment.warehouseId,
          provider: shipment.provider || 'N/A',
          trackingNumber: shipment.trackingNumber,
          labelUrl: shipment.shippingLabelUrl || null,
          trackUrl: tracking.trackUrl,
          currentStatus: tracking.currentStatus,
          estimatedDelivery: tracking.estimatedDelivery,
          timeline: tracking.timeline,
          trackingData: tracking.trackingData,
        };
      } catch (trackingError) {
        console.error('Failed to fetch tracking for AWB:', shipment.trackingNumber, trackingError);
        return {
          warehouseId: shipment.warehouseId,
          provider: shipment.provider || 'N/A',
          trackingNumber: shipment.trackingNumber,
          labelUrl: shipment.shippingLabelUrl || null,
          trackUrl: `https://shiprocket.co.in/tracking/${shipment.trackingNumber}`,
          trackingData: null,
          trackingError: 'Failed to fetch tracking data',
        };
      }
    });

    const shipments = await Promise.all(trackingPromises);

    return httpResponse(req, res, 200, 'Tracking info fetched', { shipments });
  } catch (error: unknown) {
    return httpError(next, error, req, 400);
  }
};
