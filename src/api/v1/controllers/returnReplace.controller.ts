import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Razorpay from 'razorpay';
import { Order } from '@/api/v1/models/order.model';
import { Variant } from '@/api/v1/models/variant.model';
import { Product } from '@/api/v1/models/product.model';
import { WarehouseLocation } from '@/api/v1/models/warehouse.model';
import { Transaction } from '@/api/v1/models/transaction.model';
import { ReturnReplace } from '@/api/v1/models/returnReplace.model';
import { shiprocketService } from '@/api/v1/services/shiprocket.service';
import { httpError } from '@/api/v1/utils/httpError';
import httpResponse from '@/api/v1/utils/httpResponse';
import { AuthRequest } from '@/api/v1/interfaces/auth.interface';
import env from '@/config/env';
import { User } from '@/api/v1/models/user.model';

// ==========================================
// GROUP A: CUSTOMER CONTROLLERS
// ==========================================

/**
 * CREATE RETURN REQUEST
 * Handles the initial submission by the customer.
 */
export const createReturnRequest = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { orderId, itemId, type, reason, customerComment, imagesArray, pickupAddress } = req.body;
    const userId = req.user!._id;

    // 1. Verify the Order is eligible
    const order = await Order.findOne({ _id: orderId, userId }).session(session);
    if (!order) throw new Error('Order not found');

    if (order.orderStatus !== 'delivered') {
      throw new Error('You can only return items from delivered orders.');
    }

    // 2. Verify the specific item exists in the order
    const targetItem = order.items.find((i) => i._id?.toString() === itemId);
    if (!targetItem) throw new Error('Item not found in this order.');
    if (targetItem.itemStatus !== 'active') {
      throw new Error(`Item is already in status: ${targetItem.itemStatus}`);
    }

    // 3. Create the Return Request
    const returnReq = await ReturnReplace.create(
      [
        {
          orderId,
          itemId,
          userId,
          type,
          reason,
          customerComment,
          imagesArray,
          pickupAddress,
          status: 'requested',
        },
      ],
      { session }
    );

    // 4. Update the item's local status inside the Order array
    targetItem.itemStatus = type === 'return' ? 'return_requested' : 'replacement_requested';

    order.statusHistory.push({
      status: `${type === 'return' ? 'Return' : 'Replacement'} Requested`,
      timestamp: new Date(),
      comment: reason,
    });

    await order.save({ session });
    await session.commitTransaction();

    return httpResponse(req, res, 201, 'Return request submitted successfully', returnReq[0]);
  } catch (error: unknown) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// GROUP B: ADMIN READ CONTROLLERS
// ==========================================

/**
 * GET ALL RETURN REQUESTS (ADMIN)
 */
export const getAllReturnRequests = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {};
    if (typeof req.query.status === 'string') query.status = req.query.status;

    const [requests, total] = await Promise.all([
      ReturnReplace.find(query)
        .populate('userId', 'name email phone')
        .populate('orderId', 'orderStatus totalAmount')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ReturnReplace.countDocuments(query),
    ]);

    return httpResponse(req, res, 200, 'Requests fetched successfully', {
      requests,
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

// ==========================================
// GROUP C: ADMIN LOGISTICS & MODERATION
// ==========================================

/**
 * APPROVE RETURN REQUEST
 * Triggers Shiprocket Reverse AWB or manual pickup.
 */
export const approveReturnRequest = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    if (!id || Array.isArray(id)) {
      return httpError(next, new Error('Invalid request'), req, 400);
    }
    const { logisticsMethod, adminNotes } = req.body; // 'shiprocket' or 'manual'
    const returnReq = await ReturnReplace.findById(id).session(session);

    if (!returnReq || returnReq.status !== 'requested') {
      throw new Error('Valid requested return not found.');
    }

    const order = await Order.findById(returnReq.orderId).session(session);
    if (!order) throw new Error('Original order not found');

    const targetItem = order.items.find((i) => i._id?.toString() === returnReq.itemId.toString());
    if (!targetItem) throw new Error('Item not found in order');

    if (logisticsMethod === 'shiprocket') {
      // Find where to send it back (Warehouse)
      const variant = await Variant.findById(targetItem.variantId).session(session);
      if (!variant) throw new Error('Variant not found');

      const product = await Product.findById(variant.productId).session(session);
      if (!product) throw new Error('Product not found');

      const warehouse = await WarehouseLocation.findById(product.pickupWareHouseId).session(
        session
      );
      if (!warehouse) throw new Error('Warehouse not found');

      // Trigger Reverse Pickup via Shiprocket
      await shiprocketService.createReversePickup({
        orderId: order._id.toString(),
        returnRequestId: returnReq._id.toString(),
        returnLocation: warehouse.pickupLocation,
        pickupAddress: returnReq.pickupAddress,
        items: [
          {
            variantId: targetItem.variantId.toString(),
            title: targetItem.snapshot.title,
            sku: targetItem.snapshot.sku,
            quantity: targetItem.quantity,
          },
        ],
      });
      returnReq.returnToWarehouseId = warehouse._id;
    }

    returnReq.status = 'pickup_scheduled';
    returnReq.adminNotes = adminNotes;
    await returnReq.save({ session });

    await session.commitTransaction();
    return httpResponse(req, res, 200, `Return approved via ${logisticsMethod}`, returnReq);
  } catch (error: unknown) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

/**
 * REJECT RETURN REQUEST
 */
export const rejectReturnRequest = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    if (!id || Array.isArray(id)) {
      return httpError(next, new Error('Invalid request'), req, 400);
    }
    const { reason } = req.body;
    const returnReq = await ReturnReplace.findOneAndUpdate(
      { _id: id, status: 'requested' },
      { status: 'rejected', adminNotes: reason },
      { returnDocument: 'after' }
    );

    if (!returnReq) throw new Error('Valid request not found.');

    // We must also revert the item status in the order back to 'active'
    await Order.updateOne(
      { 'items._id': returnReq.itemId },
      { $set: { 'items.$.itemStatus': 'active' } }
    );

    return httpResponse(req, res, 200, 'Request rejected', returnReq);
  } catch (error: unknown) {
    return httpError(next, error, req, 400);
  }
};

/**
 * MARK ITEM RECEIVED
 * Physical inspection step at the warehouse.
 */
export const markItemReceived = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    if (!id || Array.isArray(id)) {
      return httpError(next, new Error('Invalid request'), req, 400);
    }
    const returnReq = await ReturnReplace.findOneAndUpdate(
      { _id: id, status: { $in: ['pickup_scheduled', 'pickup_initiated'] } },
      { status: 'item_received', adminNotes: req.body.adminNotes },
      { returnDocument: 'after' }
    );

    if (!returnReq) throw new Error('Return request not in a valid state to receive.');

    return httpResponse(req, res, 200, 'Item physically received at warehouse', returnReq);
  } catch (error: unknown) {
    return httpError(next, error, req, 400);
  }
};

// ==========================================
// GROUP D: FINAL RESOLUTION (Refund/Replace)
// ==========================================

/**
 * RESOLVE RETURN
 * Triggers Razorpay refund or dispatches a replacement.
 */
export const resolveReturn = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    if (!id || Array.isArray(id)) {
      return httpError(next, new Error('Invalid request'), req, 400);
    }
    const returnReq = await ReturnReplace.findById(id).session(session);
    if (!returnReq || returnReq.status !== 'item_received') {
      throw new Error('Item must be marked as received before resolution.');
    }

    const order = await Order.findById(returnReq.orderId).session(session);
    if (!order) throw new Error('Order not found');

    const targetItem = order.items.find((i) => i._id?.toString() === returnReq.itemId.toString());
    if (!targetItem) throw new Error('Item not found in order');

    if (returnReq.type === 'return') {
      // --- SCENARIO A: REFUND ---
      const { refundMethod, manualReference } = req.body;

      const transaction = await Transaction.findOne({ orderId: order._id }).session(session);

      if (refundMethod === 'razorpay' && transaction?.paymentStatus === 'success') {
        const rzp = new Razorpay({
          key_id: env.RAZORPAY_KEY_ID,
          key_secret: env.RAZORPAY_KEY_SECRET,
        });
        const refundAmount = targetItem.subtotal; // Refund only the item amount

        if (!transaction.gatewayPaymentId) {
          throw new Error('Gateway Payment ID missing for Razorpay refund');
        }

        const refundRes = await rzp.payments.refund(transaction.gatewayPaymentId, {
          amount: Math.round(refundAmount * 100),
          notes: { returnReqId: returnReq._id.toString() },
        });

        returnReq.refundReferenceId = refundRes.id;
      } else {
        returnReq.refundReferenceId = manualReference;
      }

      returnReq.refundMethod = refundMethod;
      returnReq.refundStatus = 'processed';
      returnReq.refundAmount = targetItem.subtotal;
      targetItem.itemStatus = 'returned';

      // Put the item back into inventory!
      await Variant.findByIdAndUpdate(targetItem.variantId, {
        $inc: { stocks: targetItem.quantity },
      }).session(session);
    } else if (returnReq.type === 'replace') {
      // --- SCENARIO B: REPLACE ---
      // 1. Decrement inventory for the new item we are shipping
      const variant = await Variant.findById(targetItem.variantId).session(session);
      if (!variant) throw new Error('Variant not found for replacement.');

      if (variant.stocks < targetItem.quantity) {
        throw new Error('Not enough stock to replace item.');
      }
      variant.stocks -= targetItem.quantity;
      await variant.save({ session });

      // 2. Trigger Shiprocket Forward API to dispatch the new item
      const product = await Product.findById(variant.productId).session(session);
      const warehouse = await WarehouseLocation.findById(product!.pickupWareHouseId).session(
        session
      );
      if (!warehouse) throw new Error('Warehouse not found for replacement dispatch');

      const user = await User.findById(returnReq.userId).session(session);
      const customerEmail = user?.email || env.SUPPORT_EMAIL;

      const shiprocketResponse = await shiprocketService.createPickup({
        orderId: `${order._id.toString()}-REP`, // REP suffix for replacement
        pickupLocation: warehouse.pickupLocation,
        customerEmail: customerEmail,
        shippingAddress: order.shippingAddress, // Using original order's shipping address
        items: [
          {
            variantId: targetItem.variantId.toString(),
            title: targetItem.snapshot.title,
            sku: targetItem.snapshot.sku,
            quantity: targetItem.quantity,
            sellingPrice: 0, // Replacement is free
            lineTotal: 0,
          },
        ],
        weight: 0.5,
        length: 10,
        breadth: 10,
        height: 10,
      });

      returnReq.replacementShipment = {
        provider: shiprocketResponse.courierName || 'Shiprocket',
        trackingNumber: shiprocketResponse.trackingNumber,
        shippingLabelUrl: shiprocketResponse.shippingLabelUrl,
      };

      targetItem.itemStatus = 'replaced';
      returnReq.refundStatus = 'not_applicable';
    }

    returnReq.status = 'resolved';

    order.statusHistory.push({
      status: `Item ${returnReq.type === 'return' ? 'Refunded' : 'Replaced'}`,
      timestamp: new Date(),
    });

    await order.save({ session });
    await returnReq.save({ session });
    await session.commitTransaction();

    return httpResponse(
      req,
      res,
      200,
      `Request successfully resolved (${returnReq.type})`,
      returnReq
    );
  } catch (error: unknown) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};
