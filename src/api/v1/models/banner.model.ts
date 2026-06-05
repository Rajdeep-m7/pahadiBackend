import mongoose, { Schema, Document } from 'mongoose';
import { IBanner } from '../interfaces/storefront.interface';

export interface IBannerDocument extends IBanner, Document {}

const BannerSchema = new Schema<IBannerDocument>(
  {
    title: { type: String, required: true },
    desktopImage: {
      url: { type: String, required: true },
      publicId: { type: String, required: true },
    },
    mobileImage: {
      url: { type: String, required: true },
      publicId: { type: String, required: true },
    },
    link: { type: String },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Banner = mongoose.model<IBannerDocument>('Banner', BannerSchema);
