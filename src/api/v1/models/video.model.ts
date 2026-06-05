import mongoose, { Schema, Document } from 'mongoose';
import { IVideo } from '../interfaces/storefront.interface';

export interface IVideoDocument extends IVideo, Document {}

const VideoSchema = new Schema<IVideoDocument>(
  {
    title: { type: String, required: true },
    video: {
      url: { type: String, required: true },
      publicId: { type: String, required: true },
    },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Video = mongoose.model<IVideoDocument>('Video', VideoSchema);
