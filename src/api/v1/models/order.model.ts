import mongoose, { Schema, Document } from 'mongoose';
import {
  IOrder,
  IOrderItem,
  IOrderStatusHistory,
} from '../interfaces/order.interface';
import { IShippingAddress } from '../interfaces/address.interface';

export interface IOrderDocument extends IOrder, Document {}

// --- SUB-SCHEMAS ---
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

const OrderStatusHistorySchema = new Schema<IOrderStatusHistory>(
  {
    status: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    comment: { type: String },
  },
  { _id: false }
);

const OrderItemSchema = new Schema<IOrderItem>(
  {
    variantId: { type: Schema.Types.ObjectId, ref: 'Variant', required: true },
    snapshot: {
      productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
      title: { type: String, required: true },
      coverImage: { type: String, required: true },
      sku: { type: String, required: true },
      attributes: { type: Map, of: String },
      returnPolicyType: { type: String, enum: ['REPLACE', 'RETURN', 'BOTH', 'NONE'], default: 'REPLACE' },
      returnWindowDays: { type: Number, default: 7 },
    },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    subtotal: { type: Number, required: true },
    discountApportioned: { type: Number, default: 0 },
    effectivePrice: { type: Number, required: true },
    effectiveSubtotal: { type: Number, required: true },
    taxDetails: [
      {
        name: { type: String },
        slab: { type: Number },
        amount: { type: Number },
      },
    ],
    totalTax: { type: Number, default: 0 },
    itemTotal: { type: Number, required: true },
    itemStatus: {
      type: String,
      enum: [
        'active',
        'return_requested',
        'returned',
        'replacement_requested',
        'replaced',
        'rejected_by_admin',
        'cancelled',
      ],
      default: 'active',
    },
    refundStatus: {
      type: String,
      enum: ['pending', 'processed', 'failed', 'not_applicable'],
      default: 'pending',
    },
    refundId: { type: String },
    refundAmount: { type: Number },
  },
  { _id: true }
);

// --- MAIN SCHEMA ---
const OrderSchema = new Schema<IOrderDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    items: [OrderItemSchema],
    shippingAddress: { type: ShippingAddressSchema, required: true },

    subtotal: { type: Number, required: true, min: 0 },
    couponDiscount: { type: Number, default: 0, min: 0 },
    itemTax: { type: Number, required: true, min: 0 },
    shippingCost: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    appliedCoupon: { type: String },

    orderStatus: {
      type: String,
      enum: ['pending_payment', 'processing', 'shipped', 'delivered', 'cancelled', 'returned', 'payment_failed', 'payment_expired'],
      default: 'pending_payment',
    },
    statusHistory: [OrderStatusHistorySchema],

    shipments: [
      {
        warehouseId: { type: Schema.Types.ObjectId, ref: 'WarehouseLocation' },
        provider: { type: String },
        trackingNumber: { type: String },
        shippingLabelUrl: { type: String },
        deliveryStatus: { type: String },
        shiprocketOrderId: { type: Number },
        shiprocketShipmentId: { type: Number },
        trackingData: { type: Schema.Types.Mixed },
      },
    ],

    isConfirmed: { type: Boolean, default: false },
    confirmedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    confirmedAt: { type: Date },

    // Marker for expired orders - polling checks this field
    // Set when order is created, cleared on success/failure
    paymentExpiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// --- INDEXES ---
OrderSchema.index({ orderStatus: 1, createdAt: -1 });
OrderSchema.index({ userId: 1, createdAt: -1 });
OrderSchema.index({ 'shipments.trackingNumber': 1 });
OrderSchema.index({ isConfirmed: 1 });

export const Order = mongoose.model<IOrderDocument>('Order', OrderSchema);