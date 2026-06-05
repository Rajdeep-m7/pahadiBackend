import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';
import { IUser } from '../interfaces/user.interface';

export interface IUserDocument extends IUser, Document {
  comparePassword: (candidatePassword: string) => Promise<boolean>;
}

const UserSchema = new Schema<IUserDocument>(
  {
    name: {
      type: String,
      required: function (this: IUserDocument) {
        return this.role === 'admin' || this.role === 'staff';
      },
    },
    email: { type: String, unique: true, lowercase: true, sparse: true },
    phone: { type: String, required: true, unique: true, min: 10 },
    passwordHash: {
      type: String,
      select: false,
      required: function (this: IUserDocument) {
        return this.role === 'admin' || this.role === 'staff';
      },
    },
    role: {
      type: String,
      enum: ['customer', 'staff', 'admin'],
      default: 'customer',
      required: true,
    },
    isActive: { type: Boolean, default: true },
    tokensRevokedAt: { type: Date },
  },
  { timestamps: true }
);

UserSchema.pre('save', async function () {
  if (!this.isModified('passwordHash')) return;
  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
});

UserSchema.methods.comparePassword = async function (candidatePassword: string) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

export const User = mongoose.model<IUserDocument>('User', UserSchema);
