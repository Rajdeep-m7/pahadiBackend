import { Response, NextFunction, Request } from 'express';
import mongoose from 'mongoose';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { Transaction, ITransactionDocument } from '@/api/v1/models/transaction.model';
import { Order } from '@/api/v1/models/order.model';
import { Cart } from '@/api/v1/models/cart.model';
import { Variant } from '@/api/v1/models/variant.model';
import { httpError } from '@/api/v1/utils/httpError';
import httpResponse from '@/api/v1/utils/httpResponse';
import { AuthRequest } from '@/api/v1/interfaces/auth.interface';
import env from '@/config/env';

// ==========================================
// HELPERS
// ==========================================

const razorpay = new Razorpay({
  key_id: env.RAZORPAY_KEY_ID,
  key_secret: env.RAZORPAY_KEY_SECRET,
});

/**
 * Decrement stock for all items in an order.
 * Called when payment succeeds.
 */
const decrementStock = async (
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
 * Called when payment fails or expires.
 */
const restoreStock = async (
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
 * Common logic to finalize a successful transaction and update the order.
 * Used by both the Webhook and the Verify Payment endpoint.
 */
const finalizeSuccessfulPayment = async (
  gatewayOrderId: string,
  gatewayPaymentId: string,
  gatewaySignature: string,
  session: mongoose.ClientSession
) => {
  const transaction = await Transaction.findOne({ gatewayOrderId }).session(session);

  if (transaction && !transaction.isProcessed) {
    const order = await Order.findById(transaction.orderId).session(session);

    if (order) {
      // 1. Clear TTL expiry (null = TTL ignores this document)
      order.paymentExpiresAt = null;

      // 2. Update Order status to processing
      order.orderStatus = 'processing';
      order.statusHistory.push({
        status: 'Payment Successful',
        timestamp: new Date(),
        comment: `Razorpay Payment ID: ${gatewayPaymentId}`,
      });
      await order.save({ session });

      // 3. Sync Cart: Remove only purchased items (now deferred from createOrder)
      const variantIdsToRemove = order.items.map((item) => item.variantId);
      await Cart.findOneAndUpdate(
        { userId: order.userId },
        { $pull: { items: { variantId: { $in: variantIdsToRemove } } } }
      ).session(session);
    }

    // 4. Update Transaction
    transaction.paymentStatus = 'success';
    transaction.gatewayPaymentId = gatewayPaymentId;
    transaction.gatewaySignature = gatewaySignature;
    transaction.isProcessed = true;
    await transaction.save({ session });

    return true;
  }
  return false;
};

/**
 * Common logic to finalize a failed transaction and restore stock.
 * Called on payment failure or TTL expiry.
 */
const finalizeFailedPayment = async (
  transaction: ITransactionDocument,
  reason: string,
  session: mongoose.ClientSession
) => {
  const order = await Order.findById(transaction.orderId).session(session);

  if (order && order.orderStatus === 'pending_payment') {
    // 1. Restore stock
    await restoreStock(order.items, session);

    // 2. Clear TTL expiry (null = TTL ignores this document)
    order.paymentExpiresAt = null;

    // 3. Update order status
    order.orderStatus = 'payment_failed';
    order.statusHistory.push({
      status: 'Payment Failed',
      timestamp: new Date(),
      comment: reason,
    });
    await order.save({ session });

    // 4. Update transaction
    transaction.paymentStatus = 'failed';
    transaction.isProcessed = true;
    await transaction.save({ session });
  }
};

// ==========================================
// GROUP A — CUSTOMER CONTROLLERS
// ==========================================

/**
 * INITIATE PAYMENT
 * Creates a Razorpay Order and a local pending Transaction.
 */
export const initiatePayment = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { orderId } = req.body;

    const order = await Order.findOne({
      _id: orderId,
      userId: req.user!._id,
      orderStatus: 'pending_payment',
    }).session(session);

    if (!order) {
      throw new Error('Order not found or already processed.');
    }

    // Razorpay expects amount in paise
    const amountInPaise = Math.round(order.totalAmount * 100);

    // 1. Create Razorpay Order
    const razorpayOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `receipt_${order._id}`,
    });

    // 2. Create local pending Transaction
    const transaction = new Transaction({
      orderId: order._id,
      userId: req.user!._id,
      amount: order.totalAmount,
      paymentMethod: 'razorpay',
      paymentStatus: 'pending',
      gatewayOrderId: razorpayOrder.id,
    });

    await transaction.save({ session });
    await session.commitTransaction();

    return httpResponse(req, res, 201, 'Payment initiated', {
      gatewayOrderId: razorpayOrder.id,
      amount: order.totalAmount,
      currency: 'INR',
    });
  } catch (error: unknown) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

/**
 * VERIFY PAYMENT (Frontend Handshake)
 * Validates the signature from Razorpay SDK and updates order status.
 */
export const verifyPayment = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    // 1. Verify Signature
    const body = razorpayOrderId + '|' + razorpayPaymentId;
    const expectedSignature = crypto
      .createHmac('sha256', env.RAZORPAY_KEY_SECRET!)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpaySignature) {
      throw new Error('Invalid payment signature. Verification failed.');
    }

    // 2. Process Success
    const updated = await finalizeSuccessfulPayment(
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      session
    );

    await session.commitTransaction();

    return httpResponse(
      req,
      res,
      200,
      updated ? 'Payment verified and order updated' : 'Payment already processed',
      { orderId: updated ? undefined : 'already_processed' }
    );
  } catch (error: unknown) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// GROUP B — SYSTEM & WEBHOOKS
// ==========================================

/**
 * RAZORPAY WEBHOOK
 * Handled with raw body for signature verification.
 */
export const razorpayWebhook = async (req: Request, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const signature = req.headers['x-razorpay-signature'] as string;
    const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET;

    // Verify signature using the raw body buffer if available
    const rawBody = (req as AuthRequest).rawBody || JSON.stringify(req.body);

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (signature !== expectedSignature) {
      throw new Error('Invalid webhook signature');
    }

    const { event, payload } = req.body;

    if (event === 'payment.captured') {
      const payment = payload.payment.entity;
      await finalizeSuccessfulPayment(payment.order_id, payment.id, signature, session);
    } else if (event === 'payment.failed') {
      const payment = payload.payment.entity;
      const gatewayOrderId = payment.order_id;

      const transaction = await Transaction.findOne({ gatewayOrderId }).session(session);
      if (transaction && !transaction.isProcessed) {
        await finalizeFailedPayment(
          transaction,
          payment.error_description || 'Unknown payment failure',
          session
        );
      }
    }

    await session.commitTransaction();
    return httpResponse(req, res, 200, 'Webhook processed successfully');
  } catch (error: unknown) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// GROUP C — ADMIN CONTROLLERS
// ==========================================

/**
 * GET ALL TRANSACTIONS (ADMIN)
 */
export const getAllTransactionsAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {};
    if (req.query.status) query.paymentStatus = req.query.status;

    if (req.query.search) {
      const search = req.query.search as string;
      query.$or = [
        { gatewayOrderId: { $regex: search, $options: 'i' } },
        { gatewayPaymentId: { $regex: search, $options: 'i' } },
      ];
    }

    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'name email phone')
        .populate('orderId', 'totalAmount orderStatus')
        .lean(),
      Transaction.countDocuments(query),
    ]);

    return httpResponse(req, res, 200, 'Transactions fetched successfully', {
      transactions,
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

/**
 * GET TRANSACTION BY ID (ADMIN)
 */
export const getTransactionById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
      .populate('userId', 'name email phone')
      .populate('orderId')
      .lean();

    if (!transaction) throw new Error('Transaction not found');

    return httpResponse(req, res, 200, 'Transaction fetched successfully', { transaction });
  } catch (error: unknown) {
    return httpError(next, error, req, 404);
  }
};
