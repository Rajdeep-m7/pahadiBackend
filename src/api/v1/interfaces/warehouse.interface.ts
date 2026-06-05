export interface IWarehouseLocation {
  pickupLocation: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  address2?: string;
  city: string;
  state: string;
  country: string;
  pinCode: string;
  isActive: boolean;
  isVerified: boolean;
}
