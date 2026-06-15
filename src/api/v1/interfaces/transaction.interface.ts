import mongoose from 'mongoose';

export interface ITransaction {
  orderId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  amount: number;
  paymentMethod: 'razorpay' | 'manual';
  paymentStatus: 'pending' | 'success' | 'failed' | 'refunded' | 'refund_failed' | 'refund_pending';
  gatewayOrderId?: string;
  gatewayPaymentId?: string;
  gatewaySignature?: string;
  isProcessed: boolean;
  // Refund tracking
  refundId?: string;
  refundInitiatedAt?: Date;
  refundFailureReason?: string;
  refundProcessedBy?: mongoose.Types.ObjectId;
}
