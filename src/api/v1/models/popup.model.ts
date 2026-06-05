import mongoose, { Schema, Document } from 'mongoose';
import { IPopup } from '../interfaces/storefront.interface';

export interface IPopupDocument extends IPopup, Document {}

const PopupSchema = new Schema<IPopupDocument>(
  {
    title: { type: String, required: true },
    image: {
      url: { type: String, required: true },
      publicId: { type: String, required: true },
    },
    link: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Popup = mongoose.model<IPopupDocument>('Popup', PopupSchema);
