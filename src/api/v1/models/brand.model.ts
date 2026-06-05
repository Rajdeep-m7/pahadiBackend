import mongoose, { Schema, Document } from 'mongoose';
import { IBrand } from '../interfaces/brand.interface';

export interface IBrandDocument extends IBrand, Document {}

const BrandSchema = new Schema<IBrandDocument>(
  {
    name: { type: String, required: true },
    logoUrl: { type: String },
    logoPublicId: { type: String },
  },
  { timestamps: true }
);

export const Brand = mongoose.model<IBrandDocument>('Brand', BrandSchema);
