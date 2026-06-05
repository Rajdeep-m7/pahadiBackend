import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { UploadedFile } from 'express-fileupload';
import { AuthRequest } from '../interfaces/auth.interface';
import { Review } from '@/api/v1/models/reviews.model';
import { Variant } from '@/api/v1/models/variant.model';
import { Order } from '@/api/v1/models/order.model';
import { Product } from '@/api/v1/models/product.model';
import { cloudinaryService } from '@/api/v1/services/cloudinary.service';

const updateProductRating = async (productId: mongoose.Types.ObjectId, session?: mongoose.ClientSession) => {
  const stats = await Review.aggregate([
    { $match: { productId, isActive: true } },
    {
      $group: {
        _id: '$productId',
        numReviews: { $sum: 1 },
        averageRating: { $avg: '$rating' },
      },
    },
  ]).session(session as any);

  if (stats.length > 0) {
    await Product.findByIdAndUpdate(productId, {
      rating: Math.round(stats[0].averageRating * 10) / 10,
      numReviews: stats[0].numReviews,
    }).session(session as any);
  } else {
    await Product.findByIdAndUpdate(productId, {
      rating: 0,
      numReviews: 0,
    }).session(session as any);
  }
};
import { validateFileSize } from '@/api/v1/utils/fileValidation';
import { httpError } from '@/api/v1/utils/httpError';
import httpResponse from '@/api/v1/utils/httpResponse';

const normalizeUploadedFiles = (files: UploadedFile | UploadedFile[]): UploadedFile[] =>
  Array.isArray(files) ? files : [files];

const uploadReviewImages = async (files: UploadedFile | UploadedFile[]) => {
  const uploadedFiles = normalizeUploadedFiles(files);
  validateFileSize(uploadedFiles);

  return Promise.all(
    uploadedFiles.map(async (file) => {
      const uploaded = await cloudinaryService.uploadFile(
        file.tempFilePath,
        'reviews/images',
        file.mimetype
      );

      return {
        url: uploaded.secure_url,
        publicId: uploaded.public_id,
      };
    })
  );
};

export const createReview = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!req.user) throw new Error('Not authenticated');

    const productId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
    if (!mongoose.isValidObjectId(productId)) throw new Error('Invalid product ID');

    const variantIds = await Variant.find({ productId }).select('_id').session(session).lean();

    if (!variantIds.length) throw new Error('Product not found');

    const ordered = await Order.exists({
      userId: req.user._id,
      orderStatus: { $nin: ['pending_payment', 'payment_failed', 'payment_expired', 'cancelled'] },
      'items.variantId': { $in: variantIds.map((variant) => variant._id) },
    }).session(session);

    if (!ordered) throw new Error('You must order this product before writing a review');

    let images = req.body.images ?? [];
    if (req.files && req.files.images) {
      const uploadedImages = await uploadReviewImages(req.files.images as UploadedFile | UploadedFile[]);
      images = uploadedImages;
    }

    const newReview = new Review({
      userId: req.user._id,
      productId: new mongoose.Types.ObjectId(String(productId)),
      rating: req.body.rating,
      comment: req.body.comment,
      images,
    });

    await newReview.save({ session });
    await updateProductRating(newReview.productId, session);
    await session.commitTransaction();

    return httpResponse(req, res, 201, 'Review created successfully', newReview);
  } catch (error: unknown) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

export const deleteReview = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!req.user) throw new Error('Not authenticated');

    const reviewId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
    if (!mongoose.isValidObjectId(reviewId)) throw new Error('Invalid review ID');

    const review = await Review.findOne({ _id: reviewId, userId: req.user._id }).session(session);
    if (!review) throw new Error('Review not found');

    if (review.images && review.images.length > 0) {
      await Promise.all(
        review.images.map((image) => cloudinaryService.deleteFile(image.publicId))
      );
    }

    await review.deleteOne({ session });
    await updateProductRating(review.productId, session);
    await session.commitTransaction();
    return httpResponse(req, res, 200, 'Review deleted successfully');
  } catch (error) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

export const getReviewsByProduct = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const productId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
        if (!mongoose.isValidObjectId(productId)) throw new Error('Invalid product ID');

        const reviews = await Review.find({ productId: new mongoose.Types.ObjectId(String(productId)), isActive: true })
          .populate('userId', 'name')
          .session(session)
          .lean();

        await session.commitTransaction();
        return httpResponse(req, res, 200, 'Reviews fetched successfully', reviews);
    } catch (error) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }    
}
    
export const getReviewsByUser = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        if (!req.user) throw new Error('Not authenticated');

        const reviews = await Review.find({ userId: req.user._id })
          .populate('productId', 'title image slug coverImage')
          .session(session)
          .lean();

        await session.commitTransaction();
        return httpResponse(req, res, 200, 'Reviews fetched successfully', reviews);
    } catch (error) {
        await session.abortTransaction();
        return httpError(next, error, req, 400);
    } finally {
        session.endSession();
    }
};

export const getAllReviews = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const reviews = await Review.find()
          .populate('userId', 'name')
          .populate('productId', 'title coverImage')
          .sort({ createdAt: -1 })
          .session(session)
          .lean();

        await session.commitTransaction();
        return httpResponse(req, res, 200, 'Reviews fetched successfully', reviews);
    } catch (error) {
        await session.abortTransaction();
        return httpError(next, error, req, 400);
    } finally {
        session.endSession();
    }
}

export const setReviewActiveStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const reviewId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
    if (!mongoose.isValidObjectId(reviewId)) throw new Error('Invalid review ID');

    const review = await Review.findById(reviewId).session(session);
    if (!review) throw new Error('Review not found');

    review.isActive = req.body.isActive;
    await review.save({ session });
    await updateProductRating(review.productId, session);

    await session.commitTransaction();
    return httpResponse(req, res, 200, `Review isActive set to ${review.isActive}`);
  } catch (error) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

export const updateReview = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        if (!req.user) throw new Error('Not authenticated');

        const reviewId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
        if (!mongoose.isValidObjectId(reviewId)) throw new Error('Invalid review ID');

        const review = await Review.findById(reviewId).session(session);
        if (!review) throw new Error('Review not found');

        if (req.user.role !== 'admin' && review.userId.toString() !== req.user._id.toString()) {
            throw new Error('Not authorized to edit this review');
        }

        if (req.files && req.files.images) {
          if (review.images && review.images.length > 0) {
            await Promise.all(
              review.images.map((image) => cloudinaryService.deleteFile(image.publicId))
            );
          }

          review.images = await uploadReviewImages(req.files.images as UploadedFile | UploadedFile[]);
        } else if (req.body.images) {
          review.images = req.body.images;
        }

        review.comment = req.body.comment ?? review.comment;
        review.rating = req.body.rating ?? review.rating;

        await review.save({ session });
        await updateProductRating(review.productId, session);

        await session.commitTransaction();
        return httpResponse(req, res, 200, 'Review updated successfully');

    } catch (error) {
        await session.abortTransaction();
        return httpError(next, error, req, 400);
    } finally {
        session.endSession();
    }
}
