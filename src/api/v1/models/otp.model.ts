import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';
import { IOtp } from '../interfaces/otp.interface';

export interface IOtpDocument extends IOtp, Document {
  compareOtp: (candidateOtp: string) => Promise<boolean>;
}

const OtpSchema = new Schema<IOtpDocument>({
  phone: { type: String, required: true },
  otp: { type: String, required: true },
  type: {
    type: String,
    enum: ['login', 'verification', 'password_reset', 'mobile_change', 'account_deletion'],
    default: 'login',
    required: true,
  },
  createdAt: { type: Date, default: Date.now },

  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 5 * 60 * 1000),
  },
});

OtpSchema.pre('save', async function () {
  if (!this.isModified('otp')) return;

  const salt = await bcrypt.genSalt(8);
  this.otp = await bcrypt.hash(this.otp, salt);
});

OtpSchema.methods.compareOtp = async function (candidateOtp: string) {
  return bcrypt.compare(candidateOtp, this.otp);
};

OtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Otp = mongoose.model<IOtpDocument>('Otp', OtpSchema);
