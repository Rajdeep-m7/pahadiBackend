import { Response, NextFunction } from 'express';
import { Coupon } from '@/api/v1/models/coupon.model';
import { httpError } from '@/api/v1/utils/httpError';
import httpResponse from '@/api/v1/utils/httpResponse';
import { AuthRequest } from '@/api/v1/interfaces/auth.interface';
import { Order } from '@/api/v1/models/order.model';

// ==========================================
// VALIDATE COUPON (Pre-order check)
// ==========================================
export const validateCoupon = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { code, subtotal } = req.query as { code?: string; subtotal?: string };

    if (!code) throw new Error('Coupon code is required');

    const subtotalNum = parseFloat(subtotal as string) || 0;
    const coupon = await Coupon.findOne({ code: (code as string).toUpperCase(), isActive: true });

    if (!coupon) {
      return httpResponse(req, res, 200, 'Coupon is valid', {
        valid: true,
        coupon: null,
        calculatedDiscount: 0,
        message: 'No active coupon found with this code.',
      });
    }

    if (new Date() > coupon.expiresAt) {
      return httpResponse(req, res, 200, 'Coupon has expired', {
        valid: false,
        error: 'This coupon has expired.',
        coupon: null,
        calculatedDiscount: 0,
      });
    }

    if (subtotalNum < coupon.minOrderValue) {
      return httpResponse(req, res, 200, 'Minimum order value not met', {
        valid: false,
        error: `Minimum order value of ₹${coupon.minOrderValue} required.`,
        coupon: {
          code: coupon.code,
          type: coupon.type,
          value: coupon.value,
          maxDiscount: coupon.maxDiscount,
          minOrderValue: coupon.minOrderValue,
        },
        calculatedDiscount: 0,
      });
    }

    // Check user usage limit
    if (coupon.userLimit > 0 && req.user) {
      const userUsageCount = await Order.countDocuments({
        userId: req.user._id,
        appliedCoupon: coupon.code,
      });
      if (userUsageCount >= coupon.userLimit) {
        return httpResponse(req, res, 200, 'Coupon usage limit reached', {
          valid: false,
          error: `You have already used this coupon ${coupon.userLimit} time(s).`,
          coupon: {
            code: coupon.code,
            type: coupon.type,
            value: coupon.value,
            maxDiscount: coupon.maxDiscount,
          },
          calculatedDiscount: 0,
        });
      }
    }

    // Calculate discount
    let calculatedDiscount: number;
    if (coupon.type === 'percentage') {
      calculatedDiscount = subtotalNum * (coupon.value / 100);
      if (coupon.maxDiscount > 0 && calculatedDiscount > coupon.maxDiscount) {
        calculatedDiscount = coupon.maxDiscount;
      }
    } else {
      calculatedDiscount = Math.min(coupon.value, subtotalNum);
    }

    return httpResponse(req, res, 200, 'Coupon is valid', {
      valid: true,
      coupon: {
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        maxDiscount: coupon.maxDiscount,
        minOrderValue: coupon.minOrderValue,
      },
      calculatedDiscount: Math.round(calculatedDiscount * 100) / 100,
    });
  } catch (error: unknown) {
    return httpError(next, error, req, 400);
  }
};

// ==========================================
// CREATE COUPON (Admin)
// ==========================================
export const createCoupon = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { code, type, value, minOrderValue, maxDiscount, expiresAt, userLimit } = req.body;

    const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
    if (existingCoupon) {
      throw new Error('A coupon with this code already exists.');
    }

    const coupon = await Coupon.create({
      code: code.toUpperCase(),
      type,
      value,
      minOrderValue: minOrderValue || 0,
      maxDiscount: maxDiscount || 0,
      expiresAt: new Date(expiresAt),
      userLimit: userLimit || 1,
      isActive: true,
      usedCount: 0,
    });

    return httpResponse(req, res, 201, 'Coupon created successfully', { coupon });
  } catch (error: unknown) {
    return httpError(next, error, req, 400);
  }
};

// ==========================================
// GET AVAILABLE COUPONS (Customer-facing)
// ==========================================
export const getAvailableCoupons = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const maxOrderValue = parseFloat(req.query.maxOrderValue as string) || undefined;

    const query: Record<string, unknown> = {
      isActive: true,
      expiresAt: { $gt: new Date() },
    };

    if (maxOrderValue !== undefined) {
      query.minOrderValue = { $lte: maxOrderValue };
    } else {
      return httpError(next, new Error('Bad request'), req, 404);
    }

    const coupons = await Coupon.find(query)
      .select('code type value minOrderValue maxDiscount expiresAt')
      .sort({ createdAt: -1 })
      .lean();

    return httpResponse(req, res, 200, 'Available coupons fetched successfully', { coupons });
  } catch (error: unknown) {
    return httpError(next, error, req, 500);
  }
};

// ==========================================
// GET ALL COUPONS (Admin)
// ==========================================
export const getCoupons = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const [coupons, total] = await Promise.all([
      Coupon.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Coupon.countDocuments(),
    ]);

    return httpResponse(req, res, 200, 'Coupons fetched successfully', {
      coupons,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: unknown) {
    return httpError(next, error, req, 500);
  }
};

// ==========================================
// GET COUPON BY ID (Admin)
// ==========================================
export const getCouponById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const coupon = await Coupon.findById(req.params.id).lean();
    if (!coupon) throw new Error('Coupon not found');

    return httpResponse(req, res, 200, 'Coupon fetched successfully', { coupon });
  } catch (error: unknown) {
    return httpError(next, error, req, 404);
  }
};

// ==========================================
// UPDATE COUPON (Admin)
// ==========================================
export const updateCoupon = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { code, type, value, minOrderValue, maxDiscount, expiresAt, userLimit, isActive } =
      req.body;

    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) throw new Error('Coupon not found');

    if (code) coupon.code = code.toUpperCase();
    if (type) coupon.type = type;
    if (value !== undefined) coupon.value = value;
    if (minOrderValue !== undefined) coupon.minOrderValue = minOrderValue;
    if (maxDiscount !== undefined) coupon.maxDiscount = maxDiscount;
    if (expiresAt) coupon.expiresAt = new Date(expiresAt);
    if (userLimit !== undefined) coupon.userLimit = userLimit;
    if (isActive !== undefined) coupon.isActive = isActive;

    await coupon.save();

    return httpResponse(req, res, 200, 'Coupon updated successfully', { coupon });
  } catch (error: unknown) {
    return httpError(next, error, req, 400);
  }
};

// ==========================================
// DELETE COUPON (Admin)
// ==========================================
export const deleteCoupon = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) throw new Error('Coupon not found');

    return httpResponse(req, res, 200, 'Coupon deleted successfully');
  } catch (error: unknown) {
    return httpError(next, error, req, 404);
  }
};
