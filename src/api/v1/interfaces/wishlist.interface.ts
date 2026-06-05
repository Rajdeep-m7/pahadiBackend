import mongoose from 'mongoose';

export interface IWishlist {
  userId: mongoose.Types.ObjectId;
  variantIds: mongoose.Types.ObjectId[];
}
