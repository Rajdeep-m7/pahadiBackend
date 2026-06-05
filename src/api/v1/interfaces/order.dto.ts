import { Types } from 'mongoose';

/**
 * DTO for admin order list item response.
 */
export interface IAdminOrderItem {
  itemTotal: number;
  quantity: number;
  title: string;
  sku: string;
  coverImage: string;
  attributes: Record<string, string>;
  itemStatus: string;
}

/**
 * DTO for admin order list response.
 */
export interface IAdminOrderListItem {
  orderId: Types.ObjectId;
  createdAt: Date;
  customerName: string;
  customerPhone: string;
  totalAmount: number;
  orderStatus: string;
  orderStatusRaw: string;
  paymentMethod: string;
  paymentStatus: string;
  items: IAdminOrderItem[];
  isConfirmed: boolean;
  shippingAddress: {
    fullName: string;
    phone: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
}