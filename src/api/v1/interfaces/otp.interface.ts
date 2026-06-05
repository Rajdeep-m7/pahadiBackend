export interface IOtp {
  phone: string;
  otp: string;
  type: 'login' | 'verification' | 'password_reset' | 'mobile_change';
  createdAt: Date;
  expiresAt: Date;
}
