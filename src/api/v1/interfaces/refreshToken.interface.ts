export interface IRefreshToken {
  userId: string;
  tokenHash: string;
  authMethod: 'otp' | 'password';
  createdAt: Date;
  expiresAt: Date;
  deviceInfo?: string;
}
