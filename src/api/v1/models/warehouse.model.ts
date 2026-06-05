import mongoose, { Schema, Document } from 'mongoose';
import { IWarehouseLocation } from '../interfaces/warehouse.interface';

export interface IWarehouseDocument extends IWarehouseLocation, Document {}

const WarehouseLocationSchema = new Schema<IWarehouseDocument>(
  {
    pickupLocation: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    address2: { type: String },
    city: { type: String, required: true },
    state: { type: String, required: true },
    country: { type: String, required: true, default: 'India' },
    pinCode: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const WarehouseLocation = mongoose.model<IWarehouseDocument>(
  'WarehouseLocation',
  WarehouseLocationSchema
);
