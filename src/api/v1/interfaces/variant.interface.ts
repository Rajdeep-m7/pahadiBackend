import { Types } from 'mongoose';

export interface IDiscount {
  type: 'percentage' | 'flat';
  value: number;
}

export interface IVariant {
  productId: Types.ObjectId;
  title: string;
  slug: string;
  sku: string;
  price: number;
  mrp: number;
  discount?: IDiscount;
  stocks: number;
  attributes?: Map<string, string>;
  coverImage: { url: string; publicId: string };
  imagesArray: { url: string; publicId: string }[];
  isActive: boolean;
  isDefault: boolean;
}
