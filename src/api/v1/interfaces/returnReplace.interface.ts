import mongoose from 'mongoose';
import { IShippingAddress } from './address.interface';

export interface IReturnReplace {
  orderId: mongoose.Types.ObjectId;
  itemId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  type: 'return' | 'replace';
  reason: string;
  customerComment?: string;
  imagesArray: { url: string; publicId: string }[];
  pickupAddress: IShippingAddress;
  returnToWarehouseId?: mongoose.Types.ObjectId;
  status: 'requested' | 'approved' | 'rejected' | 'pickup_scheduled' | 'item_received' | 'resolved';
  refundStatus: 'pending' | 'processed' | 'failed' | 'not_applicable';
  refundMethod?: 'razorpay' | 'manual';
  refundAmount?: number;
  refundReferenceId?: string;
  adminNotes?: string;
  replacementShipment?: {
    provider?: string;
    trackingNumber?: string;
    shippingLabelUrl?: string;
  };
}
