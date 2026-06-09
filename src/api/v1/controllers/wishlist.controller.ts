import { Response, NextFunction } from 'express';
import { Wishlist } from '@/api/v1/models/wishlist.model';
import { httpError } from '@/api/v1/utils/httpError';
import httpResponse from '@/api/v1/utils/httpResponse';
import { AuthRequest } from '@/api/v1/interfaces/auth.interface';

const MAX_WISHLIST_ITEMS = 50;

// ==========================================
// GET WISHLIST
// ==========================================
export const getWishlist = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new Error('Not authenticated');

    const wishlist = await Wishlist.findOne({ userId: req.user._id }).populate({
      path: 'variantIds',
      select: 'title price mrp coverImage stocks slug productId attributes',
      populate: {
        path: 'productId',
        select: 'title coverImage rating categoryId reviews slug',
        populate: {
          path: 'categoryId',
          select: 'name slug'
        }
      }
    });

    return httpResponse(
      req,
      res,
      200,
      'Wishlist fetched successfully',
      wishlist || { variantIds: [] }
    );
  } catch (error: unknown) {
    return httpError(next, error, req, 500);
  }
};

// ==========================================
// TOGGLE WISHLIST ITEM
// ==========================================
export const toggleWishlistItem = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new Error('Not authenticated');

    const { variantId } = req.params;
    const userId = req.user._id;

    const wishlist = await Wishlist.findOne({ userId });

    const isExisting = wishlist?.variantIds.some((id) => id.toString() === variantId);

    if (isExisting) {
      // Remove item
      await Wishlist.updateOne({ userId }, { $pull: { variantIds: variantId } });
      return httpResponse(req, res, 200, 'Item removed from wishlist', { isSaved: false });
    } else {
      // Add item (with limit check)
      if (wishlist && wishlist.variantIds.length >= MAX_WISHLIST_ITEMS) {
        throw new Error(`Wishlist limit reached (${MAX_WISHLIST_ITEMS} items max)`);
      }

      await Wishlist.findOneAndUpdate(
        { userId },
        { $addToSet: { variantIds: variantId } },
        { upsert: true }
      );
      return httpResponse(req, res, 200, 'Item added to wishlist', { isSaved: true });
    }
  } catch (error: unknown) {
    return httpError(next, error, req, 400);
  }
};
