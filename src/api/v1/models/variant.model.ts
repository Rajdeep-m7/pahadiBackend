import mongoose, { Schema, Document } from 'mongoose';
import { IVariant } from '../interfaces/variant.interface';

export interface IVariantDocument extends IVariant, Document {}

const ImageSubSchema = new Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
  },
  { _id: false }
);

const VariantSchema = new Schema<IVariantDocument>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    sku: { type: String, required: true, unique: true },
    price: { type: Number, required: true, min: 0 },
    mrp: { type: Number, required: true, min: 0 },
    discount: {
      type: { type: String, enum: ['percentage', 'flat'] },
      value: { type: Number, min: 0 },
    },
    stocks: { type: Number, required: true, default: 0 },
    attributes: { type: Map, of: String },
    coverImage: {
      url: { type: String, required: true },
      publicId: { type: String, required: true },
    },
    imagesArray: [ImageSubSchema],
    isActive: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Search Index
VariantSchema.index({ title: 'text', sku: 'text' });

export const Variant = mongoose.model<IVariantDocument>('Variant', VariantSchema);
