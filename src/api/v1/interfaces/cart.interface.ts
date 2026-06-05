import mongoose from 'mongoose';

export interface ICartItem {
  variantId: mongoose.Types.ObjectId;
  quantity: number;
}

export interface ICart {
  userId: mongoose.Types.ObjectId;
  items: ICartItem[];
}
