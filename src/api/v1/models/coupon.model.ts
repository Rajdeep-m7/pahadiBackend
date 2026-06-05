import mongoose, { Schema, Document } from 'mongoose';

export interface ICoupon {
  code: string;
  type: 'percentage' | 'flat';
  value: number; // percentage (0-100) or flat amount in rupees
  minOrderValue: number;
  maxDiscount: number; // cap for percentage coupons (e.g., ₹200 max discount)
  isActive: boolean;
  expiresAt: Date;
  usedCount: number;
  userLimit: number; // max uses per user
}

export interface ICouponDocument extends ICoupon, Document {}

const CouponSchema = new Schema<ICouponDocument>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    type: { type: String, enum: ['percentage', 'flat'], required: true },
    value: { type: Number, required: true, min: 0 },
    minOrderValue: { type: Number, default: 0 },
    maxDiscount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    expiresAt: { type: Date, required: true },
    usedCount: { type: Number, default: 0 },
    userLimit: { type: Number, default: 1 },
  },
  { timestamps: true }
);

CouponSchema.index({ code: 1, isActive: 1 });
CouponSchema.index({ expiresAt: 1 });

export const Coupon = mongoose.model<ICouponDocument>('Coupon', CouponSchema);