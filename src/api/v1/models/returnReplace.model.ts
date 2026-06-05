import mongoose, { Schema, Document } from 'mongoose';
import { IReturnReplace } from '../interfaces/returnReplace.interface';
import { IShippingAddress } from '../interfaces/address.interface';

export interface IReturnReplaceDocument extends IReturnReplace, Document {}

// Reusable Sub-Schemas
const ImageSubSchema = new Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
  },
  { _id: false }
);

const ShippingAddressSchema = new Schema<IShippingAddress>(
  {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    addressLine1: { type: String, required: true },
    addressLine2: { type: String },
    city: { type: String, required: true },
    state: { type: String, required: true },
    postalCode: { type: String, required: true },
    country: { type: String, required: true, default: 'India' },
  },
  { _id: false }
);

const ReturnReplaceSchema = new Schema<IReturnReplaceDocument>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    itemId: { type: Schema.Types.ObjectId, required: true }, // The _id of the specific item inside Order.items
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    type: { type: String, enum: ['return', 'replace'], required: true },
    reason: { type: String, required: true },
    customerComment: { type: String },
    imagesArray: [ImageSubSchema], // Proof of damage, wrong item, etc.

    pickupAddress: { type: ShippingAddressSchema, required: true },
    returnToWarehouseId: { type: Schema.Types.ObjectId, ref: 'WarehouseLocation' },

    status: {
      type: String,
      enum: ['requested', 'approved', 'rejected', 'pickup_scheduled', 'item_received', 'resolved'],
      default: 'requested',
    },

    refundStatus: {
      type: String,
      enum: ['pending', 'processed', 'failed', 'not_applicable'],
      default: 'pending',
    },
    refundMethod: { type: String, enum: ['razorpay', 'manual'] },
    refundAmount: { type: Number, min: 0 },
    refundReferenceId: { type: String }, // Razorpay Refund ID or Bank UTR

    adminNotes: { type: String },
    replacementShipment: {
      provider: { type: String },
      trackingNumber: { type: String },
      shippingLabelUrl: { type: String },
    },
  },
  { timestamps: true }
);

// Admins will likely query this collection by orderId or status heavily
ReturnReplaceSchema.index({ orderId: 1 });
ReturnReplaceSchema.index({ status: 1 });

export const ReturnReplace = mongoose.model<IReturnReplaceDocument>(
  'ReturnReplace',
  ReturnReplaceSchema
);
