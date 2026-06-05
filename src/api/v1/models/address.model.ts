import mongoose, { Schema, Document } from 'mongoose';
import { IAddress } from '../interfaces/address.interface';

export interface IAddressDocument extends IAddress, Document {}

const AddressSchema = new Schema<IAddressDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    addressLine1: { type: String, required: true },
    addressLine2: { type: String },
    city: { type: String, required: true },
    state: { type: String, required: true },
    postalCode: { type: String, required: true },
    country: { type: String, required: true, default: 'India' },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// --- INDEXES ---
AddressSchema.index({ userId: 1 });
AddressSchema.index({ userId: 1, isDefault: 1 });

export const Address = mongoose.model<IAddressDocument>('Address', AddressSchema);
