import mongoose, { Schema, Document } from 'mongoose';
import { IProduct } from '../interfaces/product.interface';

export interface IProductDocument extends IProduct, Document {}

const ProductSchema = new Schema<IProductDocument>(
  {
    title: { type: String, required: true },
    desc: { type: String, required: true },
    specs: [{ key: { type: String }, value: { type: String } }],
    brandId: { type: Schema.Types.ObjectId, ref: 'Brand', required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    pickupWareHouseId: { type: Schema.Types.ObjectId, ref: 'WarehouseLocation', required: true },
    coverImage: {
      url: { type: String },
      publicId: { type: String },
    },
    isActive: { type: Boolean, default: true },
    isPublished: { type: Boolean, default: false },
    isTaxInclude: { type: Boolean, default: true },
    taxes: [{ name: { type: String }, slab: { type: Number } }],
    returnPolicyType: {
      type: String,
      enum: ['REPLACE', 'RETURN', 'BOTH', 'NONE'],
      default: 'REPLACE',
    },
    returnWindowDays: { type: Number, default: 7 },
    defaultVariantId: { type: Schema.Types.ObjectId, ref: 'Variant' },
    displayPrice: { type: Number },
    displayMrp: { type: Number },
    displayDiscount: { type: Number },
    default_slug: { type: String },
    rating: { type: Number, default: 0 },
    numReviews: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Product = mongoose.model<IProductDocument>('Product', ProductSchema);
