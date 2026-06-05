import { Request } from 'express';
import { IUserDocument } from '@/api/v1/models/user.model';
import { IUser } from './user.interface';

export interface AuthRequest extends Request {
  user?: IUserDocument;
  rawBody?: Buffer;
  authMethod?: 'otp' | 'password';
}

export interface ILoginResponse {
  user: Partial<IUser>;
  accessToken: string;
  isNewUser?: boolean;
  refreshToken?: string;
}

export interface IRefreshResponse {
  accessToken: string;
  refreshToken?: string;
  user: Partial<IUser>;
}
