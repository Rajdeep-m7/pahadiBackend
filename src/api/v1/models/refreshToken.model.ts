import mongoose, { Schema, Document } from 'mongoose';
import { IRefreshToken } from '../interfaces/refreshToken.interface';

export interface IRefreshTokenDocument extends Omit<IRefreshToken, 'userId'>, Document {
  userId: mongoose.Types.ObjectId;
}

const RefreshTokenSchema = new Schema<IRefreshTokenDocument>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  tokenHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 Days in milliseconds
  },
  authMethod: {
    type: String,
    enum: ['otp', 'password'],
    required: true,
  },
  deviceInfo: { type: String },
});

// 3. TTL Index: Automatically delete the document when `expiresAt` is reached
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = mongoose.model<IRefreshTokenDocument>(
  'RefreshToken',
  RefreshTokenSchema
);
