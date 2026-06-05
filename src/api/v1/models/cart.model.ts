import mongoose, { Schema, Document } from 'mongoose';
import { ICart } from '../interfaces/cart.interface';

export interface ICartDocument extends ICart, Document {}

const CartItemSchema = new Schema(
  {
    variantId: { type: Schema.Types.ObjectId, ref: 'Variant', required: true },
    quantity: { type: Number, required: true, min: 1, max: 10 },
  },
  { _id: false }
);

const CartSchema = new Schema<ICartDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: [CartItemSchema],
  },
  { timestamps: true }
);

export const Cart = mongoose.model<ICartDocument>('Cart', CartSchema);
