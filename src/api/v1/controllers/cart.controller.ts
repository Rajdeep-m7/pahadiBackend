import { Response, NextFunction } from 'express';
import { Cart } from '@/api/v1/models/cart.model';
import { Category } from '@/api/v1/models/category.model';
import { Product } from '@/api/v1/models/product.model';
import { httpError } from '@/api/v1/utils/httpError';
import httpResponse from '@/api/v1/utils/httpResponse';
import { AuthRequest } from '@/api/v1/interfaces/auth.interface';
import mongoose from 'mongoose';

/**
 * Tax Resolution Helper (Duplicated from product/variant controller for consistency)
 * Resolves tax based on Product's own taxes or Category inheritance.
 */
const resolveCategoryTax = (category: any): { name: string; slab: number }[] | null => {
  if (category.taxes && category.taxes.length > 0) return category.taxes;
  if (category.parentTax) return category.parentTax;
  return null;
};

const resolveProductEffectiveTax = async (
  product: any
): Promise<{ name: string; slab: number }[] | null> => {
  if (product.taxes && product.taxes.length > 0) return product.taxes;
  if (!product.categoryId) return null;

  const category = await Category.findById(product.categoryId).lean();
  if (!category) return null;
  return resolveCategoryTax(category);
};

// ==========================================
// GET CART
// ==========================================
export const getCart = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new Error('Not authenticated');

    const cart = await Cart.findOne({ userId: req.user._id }).populate({
      path: 'items.variantId',
      select: 'title price mrp coverImage stocks slug productId attributes',
      populate: {
        path: 'productId',
        select: 'taxes categoryId',
      },
    });

    if (!cart) {
      return httpResponse(req, res, 200, 'Cart fetched successfully', { items: [] });
    }

    // Resolve effectiveTax and normalize attributes for each item
    const itemsWithTax = await Promise.all(
      cart.items.map(async (item: any) => {
        const itemObj = item.toObject();
        const variant = item.variantId;
        
        if (variant) {
          const effectiveTax = variant.productId ? await resolveProductEffectiveTax(variant.productId) : null;
          
          // Convert attributes Map to Object if it exists
          let attributes = undefined;
          if (variant.attributes) {
            attributes = variant.attributes instanceof Map 
              ? Object.fromEntries(variant.attributes) 
              : variant.attributes;
          }

          return {
            ...itemObj,
            variantId: {
              ...itemObj.variantId,
              attributes
            },
            effectiveTax,
          };
        }
        
        return itemObj;
      })
    );

    return httpResponse(req, res, 200, 'Cart fetched successfully', {
      ...cart.toObject(),
      items: itemsWithTax,
    });
  } catch (error: unknown) {
    return httpError(next, error, req, 500);
  }
};

// ==========================================
// SYNC CART (Debounced Background Sync)
// ==========================================
export const syncCart = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new Error('Not authenticated');

    const { items } = req.body;

    const cart = await Cart.findOneAndUpdate(
      { userId: req.user._id },
      { $set: { items } },
      { upsert: true, returnDocument: 'after', runValidators: true }
    );

    return httpResponse(req, res, 200, 'Cart synced successfully', cart);
  } catch (error: unknown) {
    return httpError(next, error, req, 400);
  }
};

// ==========================================
// CLEAR CART (After payment or manual)
// ==========================================
export const clearCart = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new Error('Not authenticated');

    await Cart.findOneAndUpdate({ userId: req.user._id }, { $set: { items: [] } });

    return httpResponse(req, res, 200, 'Cart cleared successfully');
  } catch (error: unknown) {
    return httpError(next, error, req, 500);
  }
};
