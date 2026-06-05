import { Types } from 'mongoose';

export interface IProduct {
  title: string;
  desc: string;
  specs: { key: string; value: string }[];
  brandId: Types.ObjectId;
  categoryId: Types.ObjectId;
  pickupWareHouseId: Types.ObjectId;
  coverImage?: { url: string; publicId: string };
  isActive?: boolean;
  isPublished?: boolean;
  isTaxInclude: boolean;
  // taxes: product's own tax — if empty/null, effectiveTax falls back to category
  taxes: { name: string; slab: number }[];
  // effectiveTax: resolved tax (own taxes if set, else category resolved tax via nearest-ancestor)
  effectiveTax?: { name: string; slab: number }[] | null;
  returnPolicyType?: 'REPLACE' | 'RETURN' | 'BOTH' | 'NONE';
  returnWindowDays: number;
  defaultVariantId?: Types.ObjectId;
  displayPrice?: number;
  displayMrp?: number;
  displayDiscount?: number;
  default_slug?: string;
  rating?: number;
  numReviews?: number;
}
