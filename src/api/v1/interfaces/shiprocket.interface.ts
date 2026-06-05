export interface ShiprocketAddress {
  id: number;
  pickup_location: string;
  address: string;
  address_2: string;
  city: string;
  state: string;
  country: string;
  pin_code: string;
  email: string;
  phone: string;
  name: string;
  status: number; // e.g., 1 or 2 (Active/Verified)
  phone_verified: number; // 0 or 1
}

export interface ShiprocketPickupPayload {
  pickup_location: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  address_2?: string;
  city: string;
  state: string;
  country: string;
  pin_code: string;
}
