import mongoose, { Schema, Document } from 'mongoose';
import { ITransaction } from '../interfaces/transaction.interface';

export interface ITransactionDocument extends ITransaction, Document {}

const TransactionSchema = new Schema<ITransactionDocument>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 0 },

    paymentMethod: { type: String, enum: ['razorpay', 'cod', 'manual'], required: true },
    paymentStatus: {
      type: String,
      enum: ['pending', 'success', 'failed', 'refunded', 'refund_failed', 'refund_pending'],
      default: 'pending',
    },

    gatewayOrderId: { type: String }, // e.g. order_IluGWxBm9U8zJ8
    gatewayPaymentId: { type: String }, // e.g. pay_29QQoUBi66xm2f
    gatewaySignature: { type: String },

    // Refund tracking
    refundId: { type: String },
    refundInitiatedAt: { type: Date },
    refundFailureReason: { type: String },
    refundProcessedBy: { type: Schema.Types.ObjectId, ref: 'User' },

    // Idempotency Lock to prevent double-processing Razorpay webhooks
    isProcessed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Indexes for fast lookup from Webhooks
TransactionSchema.index({ gatewayOrderId: 1 });
TransactionSchema.index({ gatewayPaymentId: 1 }, { unique: true, sparse: true });

export const Transaction = mongoose.model<ITransactionDocument>('Transaction', TransactionSchema);
