import mongoose, { Schema, Document } from 'mongoose';
import { IWishlist } from '../interfaces/wishlist.interface';

export interface IWishlistDocument extends IWishlist, Document {}

const WishlistSchema = new Schema<IWishlistDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    variantIds: [{ type: Schema.Types.ObjectId, ref: 'Variant' }],
  },
  { timestamps: true }
);

export const Wishlist = mongoose.model<IWishlistDocument>('Wishlist', WishlistSchema);
