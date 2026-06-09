export interface IUser {
  name: string;
  email: string;
  phone: string;
  passwordHash?: string;
  role: 'customer' | 'staff' | 'admin';
  isActive: boolean;
  tokensRevokedAt?: Date;
  pushToken?: string;
}
