import { Coupon } from '@/api/v1/models/coupon.model';
import { Order } from '@/api/v1/models/order.model';

export interface ICouponValidation {
  valid: boolean;
  error?: string;
  coupon?: {
    code: string;
    type: 'percentage' | 'flat';
    value: number;
    maxDiscount: number;
  };
}

/**
 * Validate a coupon code before applying it.
 * Checks: existence, active status, expiry, minimum order value, user usage limit.
 */
export const validateCoupon = async (
  code: string,
  userId: mongoose.Types.ObjectId,
  orderSubtotal: number
): Promise<ICouponValidation> => {
  const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });

  if (!coupon) {
    return { valid: false, error: 'Invalid or inactive coupon code.' };
  }

  if (new Date() > coupon.expiresAt) {
    return { valid: false, error: 'This coupon has expired.' };
  }

  if (orderSubtotal < coupon.minOrderValue) {
    return {
      valid: false,
      error: `Minimum order value of ₹${coupon.minOrderValue} required for this coupon.`,
    };
  }

  // Check user usage limit
  const userUsageCount = await Order.countDocuments({
    userId,
    appliedCoupon: coupon.code,
  });

  if (coupon.userLimit > 0 && userUsageCount >= coupon.userLimit) {
    return { valid: false, error: `You have already used this coupon ${coupon.userLimit} time(s).` };
  }

  return {
    valid: true,
    coupon: {
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      maxDiscount: coupon.maxDiscount,
    },
  };
};

/**
 * Calculate discount amount and return cap-adjusted value.
 */
export const calculateDiscountAmount = (
  type: 'percentage' | 'flat',
  value: number,
  maxDiscount: number,
  subtotal: number
): number => {
  let discount: number;

  if (type === 'percentage') {
    discount = subtotal * (value / 100);
    // Cap at maxDiscount if set
    if (maxDiscount > 0 && discount > maxDiscount) {
      discount = maxDiscount;
    }
  } else {
    // Flat discount — cannot exceed subtotal
    discount = Math.min(value, subtotal);
  }

  return Math.round(discount);
};

/**
 * Apportion discount across items proportionally by base price weight.
 * Used for flat amount coupons (e.g., ₹30 off total).
 *
 * Formula: discount_item = (itemSubtotal / totalCartSubtotal) * totalDiscount
 * where itemSubtotal = basePrice * quantity
 *
 * Returns an array of discount amounts per item.
 */
export const apportionDiscount = (
  itemBasePrices: number[],
  itemQuantities: number[],
  totalDiscount: number
): number[] => {
  if (itemBasePrices.length !== itemQuantities.length) {
    throw new Error('itemBasePrices and itemQuantities must have the same length');
  }
  if (itemBasePrices.length === 0) return [];

  const itemSubtotals = itemBasePrices.map((price, i) => price * itemQuantities[i]);
  const totalBaseSubtotal = itemSubtotals.reduce((sum, s) => sum + s, 0);

  if (totalBaseSubtotal === 0) return itemBasePrices.map(() => 0);

  // Apportion by weight (proportional to item's baseSubtotal)
  return itemSubtotals.map((subtotal) => {
    const weight = subtotal / totalBaseSubtotal;
    const apportioned = totalDiscount * weight;
    return Math.round(apportioned);
  });
};

/**
 * Apportion discount for percentage coupons.
 * Each item gets the same percentage discount applied to its base price.
 */
export const apportionPercentageDiscount = (
  itemBasePrices: number[],
  itemQuantities: number[],
  percentage: number
): number[] => {
  return itemBasePrices.map((price) => {
    return Math.round(price * (percentage / 100));
  });
};

/**
 * Calculate tax for a single item based on effective price and tax slabs.
 */
export const calculateItemTax = (
  effectiveSubtotal: number,
  taxSlabs: { name: string; slab: number }[]
): { taxDetails: { name: string; slab: number; amount: number }[]; totalTax: number } => {
  const taxDetails = taxSlabs.map((t) => ({
    name: t.name,
    slab: t.slab,
    amount: Math.round(effectiveSubtotal * (t.slab / 100)),
  }));

  const totalTax = taxDetails.reduce((sum, td) => sum + td.amount, 0);

  return { taxDetails, totalTax };
};

// Re-export mongoose for type checking
import mongoose from 'mongoose';