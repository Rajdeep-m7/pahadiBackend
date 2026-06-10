import mongoose from 'mongoose';
import { IShippingAddress } from './address.interface';

export interface IOrderSnapshot {
  productId: mongoose.Types.ObjectId;
  title: string;
  coverImage: string;
  sku: string;
  attributes?: Record<string, string>;
  returnPolicyType?: 'REPLACE' | 'RETURN' | 'BOTH' | 'NONE';
  returnWindowDays?: number;
}

export interface IOrderItem {
  _id?: mongoose.Types.ObjectId;
  variantId: mongoose.Types.ObjectId;
  snapshot: IOrderSnapshot;
  price: number; // base price per unit at order time
  quantity: number;
  subtotal: number; // baseSubtotal = price * quantity (before discount/tax)
  discountApportioned: number; // portion of coupon discount applied to this item
  effectivePrice: number; // price after discount but before tax
  effectiveSubtotal: number; // subtotal after discount = baseSubtotal - discountApportioned
  taxDetails: {
    name: string; // e.g. "CGST", "SGST"
    slab: number; // e.g. 9 for 9%
    amount: number; // tax amount calculated on effectiveSubtotal
  }[];
  totalTax: number; // sum of all taxDetail amounts
  itemTotal: number; // effectiveSubtotal + totalTax (final line total)
  itemStatus: 'active' | 'return_requested' | 'returned' | 'replacement_requested' | 'replaced' | 'rejected_by_admin' | 'cancelled';
  refundStatus?: 'pending' | 'processed' | 'failed' | 'not_applicable';
  refundId?: string;
  refundAmount?: number;
}

export interface IOrderStatusHistory {
  status: string;
  timestamp: Date;
  comment?: string;
}

export interface IOrderShipments {
  warehouseId: mongoose.Types.ObjectId;
  provider?: string;
  trackingNumber?: string;
  shippingLabelUrl?: string;
  deliveryStatus?: string;
  shiprocketOrderId?: number;
  shiprocketShipmentId?: number;
  trackingData?: any;
}

export interface IOrder {
  userId: mongoose.Types.ObjectId;
  items: IOrderItem[];
  shippingAddress: IShippingAddress;
  subtotal: number; // sum of all item subtotals (before discount, before tax)
  couponDiscount: number; // total coupon discount applied (sum of all item discountApportioned)
  itemTax: number; // sum of all item-level taxes
  shippingCost: number;
  totalAmount: number; // subtotal - couponDiscount + itemTax + shippingCost
  appliedCoupon?: string;
  orderStatus:
    | 'pending_payment'
    | 'processing'
    | 'shipped'
    | 'delivered'
    | 'cancelled'
    | 'returned'
    | 'payment_failed'
    | 'payment_expired';
  statusHistory: IOrderStatusHistory[];
  shipments?: IOrderShipments[];
  isConfirmed: boolean;
  confirmedBy?: mongoose.Types.ObjectId;
  confirmedAt?: Date;
  paymentExpiresAt?: Date; // TTL index: auto-expires pending orders after 1 hour
}
