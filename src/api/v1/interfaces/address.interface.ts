import mongoose from 'mongoose';

export interface IShippingAddress {
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface IAddress extends IShippingAddress {
  userId: mongoose.Types.ObjectId;
  isDefault: boolean;
}
