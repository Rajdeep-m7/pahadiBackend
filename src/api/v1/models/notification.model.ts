import mongoose, { Schema, Document } from 'mongoose';

export interface INotification {
  title: string;
  body: string;
  target: 'all' | 'cart' | 'wishlist';
  scheduledAt?: Date;
  sentAt?: Date;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  sentCount: number;
}

export interface INotificationDocument extends INotification, Document {}

const NotificationSchema = new Schema<INotificationDocument>(
  {
    title: { type: String, required: true },
    body: { type: String, required: true },
    target: { 
      type: String, 
      enum: ['all', 'cart', 'wishlist'], 
      required: true 
    },
    scheduledAt: { type: Date },
    sentAt: { type: Date },
    status: { 
      type: String, 
      enum: ['pending', 'sent', 'failed', 'cancelled'], 
      default: 'pending' 
    },
    sentCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Notification = mongoose.model<INotificationDocument>('Notification', NotificationSchema);
