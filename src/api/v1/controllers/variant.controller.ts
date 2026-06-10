import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { Variant } from '@/api/v1/models/variant.model';
import { Product } from '@/api/v1/models/product.model';
import { Category } from '@/api/v1/models/category.model';
import { resolveCategoryTax } from '@/api/v1/controllers/category.controller';
import { cloudinaryService } from '@/api/v1/services/cloudinary.service';
import { httpError } from '@/api/v1/utils/httpError';
import httpResponse from '@/api/v1/utils/httpResponse';
import { UploadedFile } from 'express-fileupload';
import { IVariant } from '../interfaces/variant.interface';
import { generateUniqueSlug } from '@/api/v1/utils/slug';
import { validateFileSize } from '@/api/v1/utils/fileValidation';

/**
 * Resolves a product's effective tax:
 * - If product has its own taxes (non-empty), return those
 * - Else resolve from the product's category via resolveCategoryTax
 * - Return null if no tax anywhere
 */
const resolveProductEffectiveTax = async (
  product: { taxes?: { name: string; slab: number }[]; categoryId?: mongoose.Types.ObjectId }
): Promise<{ name: string; slab: number }[] | null> => {
  if (product.taxes && product.taxes.length > 0) return product.taxes;
  if (!product.categoryId) return null;

  const category = await Category.findById(product.categoryId).lean();
  if (!category) return null;
  return resolveCategoryTax(category);
};

/**
 * Helper to sync Product with its default variant
 */
const syncProductWithDefaultVariant = async (
  productId: string | mongoose.Types.ObjectId,
  variantId: string | mongoose.Types.ObjectId
) => {
  const variant = await Variant.findById(variantId);
  if (!variant) return;

  // Calculate displayDiscount percentage
  let displayDiscount = 0;
  if (variant.discount) {
    if (variant.discount.type === 'percentage') {
      displayDiscount = variant.discount.value;
    } else {
      displayDiscount = (variant.discount.value / variant.mrp) * 100;
    }
  }

  // 1. Update Product
  await Product.findByIdAndUpdate(productId, {
    defaultVariantId: variant._id,
    displayPrice: variant.price,
    displayMrp: variant.mrp,
    displayDiscount: Math.round(displayDiscount),
    default_slug: variant.slug,
    coverImage: variant.coverImage,
  });

  // 2. Sync isDefault cache in Variants
  await Variant.updateMany({ productId, _id: { $ne: variant._id } }, { isDefault: false });
  await Variant.findByIdAndUpdate(variant._id, { isDefault: true });
};

// ==========================================
// CREATE VARIANT
// ==========================================
export const createVariant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      productId,
      title,
      sku,
      price,
      mrp,
      discount,
      stocks,
      attributes,
      isDefault,
    } = req.body;

    // 1. Validate Product
    const product = await Product.findById(productId);
    if (!product) throw new Error('Parent Product not found');

    const parsedAttributes = typeof attributes === 'string' ? JSON.parse(attributes) : attributes;

    if (parsedAttributes) {
      const keys = Object.keys(parsedAttributes);
      const normalizedKeys = keys.map((k) => k.toLowerCase().trim());
      if (new Set(normalizedKeys).size !== normalizedKeys.length) {
        throw new Error('Duplicate attribute keys (case-insensitive) are not allowed');
      }
    }

    // 2. Determine Default Status
    const siblingCount = await Variant.countDocuments({ productId });
    // Make default if explicitly requested OR if it's the very first variant
    const shouldBeDefault = isDefault === 'true' || isDefault === true || siblingCount === 0;

    // 3. Generate Slug
    // Use title and attribute values for a unique slug
    const attributeValues = Object.values(parsedAttributes || {}) as string[];
    const slug = await generateUniqueSlug([title, ...attributeValues], Variant);

    // 4. Handle Images
    if (!req.files || !req.files.coverImage) {
      throw new Error('Variant cover image is required');
    }

    const coverFile = req.files.coverImage as UploadedFile;
    validateFileSize(coverFile);

    const coverUpload = await cloudinaryService.uploadFile(
      coverFile.tempFilePath,
      'variants/covers',
      coverFile.mimetype
    );

    const variantData: Partial<IVariant> = {
      productId,
      title,
      slug,
      sku,
      price: Number(price),
      mrp: Number(mrp),
      discount: discount || undefined,
      stocks: Number(stocks),
      attributes: parsedAttributes,
      coverImage: {
        url: coverUpload.secure_url,
        publicId: coverUpload.public_id,
      },
      imagesArray: [],
      isActive: true,
      isDefault: shouldBeDefault,
    };

    if (req.files.imagesArray) {
      const images = Array.isArray(req.files.imagesArray)
        ? req.files.imagesArray
        : [req.files.imagesArray];
      validateFileSize(images as UploadedFile[]);

      const uploads = await Promise.all(
        images.map((f) =>
          cloudinaryService.uploadFile(
            (f as UploadedFile).tempFilePath,
            'variants/gallery',
            (f as UploadedFile).mimetype
          )
        )
      );
      variantData.imagesArray = uploads.map((u) => ({ url: u.secure_url, publicId: u.public_id }));
    }

    const newVariant = await Variant.create(variantData);

    // 5. Sync Logic: If it is the default, sync to Product
    if (shouldBeDefault) {
      await syncProductWithDefaultVariant(productId, newVariant._id as mongoose.Types.ObjectId);
    }

    return httpResponse(req, res, 201, 'Variant created and synced successfully', newVariant);
  } catch (error: unknown) {
    return httpError(next, error, req, 400);
  }
};

// ==========================================
// GET VARIANTS BY PRODUCT
// ==========================================
export const getVariantsByProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId } = req.params;
    const variants = await Variant.find({ productId })
      .sort({ isDefault: -1, createdAt: 1 })
      .lean();

    return httpResponse(req, res, 200, 'Product variants fetched successfully', variants);
  } catch (error: unknown) {
    return httpError(next, error, req, 400);
  }
};

// ==========================================
// GET VARIANT BY ID (Hydrated PDP Endpoint)
// ==========================================
export const getVariantById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const currentVariant = await Variant.findById(req.params.id).populate({
      path: 'productId',
      select: 'title desc specs categoryId brandId returnPolicyType returnWindowDays isPublished rating numReviews',
      populate: [
        { path: 'brandId', select: 'name logoUrl' },
        { path: 'categoryId', select: 'name' },
      ],
    });

    if (!currentVariant) throw new Error('Variant not found');

    // Publication check
    const product = currentVariant.productId as any;
    const userRole = (req as any).user?.role;
    if (
      product &&
      !product.isPublished &&
      !['admin', 'staff'].includes(userRole)
    ) {
      throw new Error('Variant not found');
    }

    const siblingOptions = await Variant.find({
      productId: currentVariant.productId,
      isActive: true,
    })
      .select('_id attributes coverImage price mrp slug isDefault')
      .sort({ price: 1 })
      .lean();

    // Resolve effective tax from product
    const effectiveTax = await resolveProductEffectiveTax(product);

    // 3. Return a unified payload
    return httpResponse(req, res, 200, 'Variant details fetched successfully', {
      currentVariant,
      siblingOptions,
      effectiveTax,
    });
  } catch (error: unknown) {
    return httpError(next, error, req, 404);
  }
};

// ==========================================
// GET VARIANT BY SLUG (Hydrated PDP Endpoint)
// ==========================================
export const getVariantBySlug = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { slug } = req.params;
    const currentVariant = await Variant.findOne({ slug }).populate({
      path: 'productId',
      select: 'title desc specs categoryId brandId returnPolicyType returnWindowDays isPublished rating numReviews',
      populate: [
        { path: 'brandId', select: 'name' },
        { path: 'categoryId', select: 'name' },
      ],
    });

    if (!currentVariant) throw new Error('Variant not found');

    // Publication check
    const product = currentVariant.productId as any;
    const userRole = (req as any).user?.role;
    if (product && !product.isPublished && !['admin', 'staff'].includes(userRole)) {
      throw new Error('Variant not found');
    }

    const siblingOptions = await Variant.find({
      productId: currentVariant.productId,
      isActive: true,
    })
      .select('_id attributes coverImage price mrp slug isDefault')
      .sort({ price: 1 })
      .lean();

    // Resolve effective tax from product
    const effectiveTax = await resolveProductEffectiveTax(product);

    return httpResponse(req, res, 200, 'Variant details fetched successfully', {
      currentVariant,
      siblingOptions,
      effectiveTax,
    });
  } catch (error: unknown) {
    return httpError(next, error, req, 404);
  }
};

// ==========================================
// UPDATE VARIANT
// ==========================================
export const updateVariant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const {
      title,
      sku,
      price,
      mrp,
      discount,
      stocks,
      attributes,
      isDefault,
      removedImagesPublicIds,
    } = req.body;

    const variant = await Variant.findById(id);
    if (!variant) throw new Error('Variant not found');

    const parsedAttributes = typeof attributes === 'string' ? JSON.parse(attributes) : attributes;

    if (parsedAttributes) {
      const keys = Object.keys(parsedAttributes);
      const normalizedKeys = keys.map((k) => k.toLowerCase().trim());
      if (new Set(normalizedKeys).size !== normalizedKeys.length) {
        throw new Error('Duplicate attribute keys (case-insensitive) are not allowed');
      }
    }

    // Slug regeneration check: update slug only if title or attributes are provided
    let slug = variant.slug;
    if (title !== undefined || attributes !== undefined) {
      const attrSource = parsedAttributes || variant.attributes;
      let attributeValues: string[] = [];

      if (attrSource instanceof Map) {
        attributeValues = Array.from(attrSource.values());
      } else if (attrSource) {
        attributeValues = Object.values(attrSource) as string[];
      }

      slug = await generateUniqueSlug([title || variant.title, ...attributeValues], Variant);
    }

    // 1. Handle Selective Image Removal from gallery
    if (removedImagesPublicIds) {
      const publicIdsToRemove = Array.isArray(removedImagesPublicIds)
        ? removedImagesPublicIds
        : [removedImagesPublicIds];

      await Promise.all(publicIdsToRemove.map((pid) => cloudinaryService.deleteFile(pid)));

      variant.imagesArray = variant.imagesArray.filter(
        (img) => !publicIdsToRemove.includes(img.publicId)
      );
    }

    const updateData: Partial<IVariant> = {
      title,
      slug,
      sku,
      price: price ? Number(price) : undefined,
      mrp: mrp ? Number(mrp) : undefined,
      discount: discount || undefined,
      stocks: stocks ? Number(stocks) : undefined,
      attributes: parsedAttributes,
    };

    // Remove undefined
    (Object.keys(updateData) as (keyof typeof updateData)[]).forEach((key) => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    // 2. Handle Image Updates
    if (req.files) {
      if (req.files.coverImage) {
        const file = req.files.coverImage as UploadedFile;
        validateFileSize(file);

        if (variant.coverImage?.publicId) {
          await cloudinaryService.deleteFile(variant.coverImage.publicId);
        }
        const upload = await cloudinaryService.uploadFile(
          file.tempFilePath,
          'variants/covers',
          file.mimetype
        );
        variant.coverImage = { url: upload.secure_url, publicId: upload.public_id };
      }

      if (req.files.imagesArray) {
        const images = Array.isArray(req.files.imagesArray)
          ? req.files.imagesArray
          : [req.files.imagesArray];
        validateFileSize(images as UploadedFile[]);

        const uploads = await Promise.all(
          images.map((f) =>
            cloudinaryService.uploadFile(
              (f as UploadedFile).tempFilePath,
              'variants/gallery',
              (f as UploadedFile).mimetype
            )
          )
        );

        const newGalleryImages = uploads.map((u) => ({
          url: u.secure_url,
          publicId: u.public_id,
        }));

        variant.imagesArray.push(...newGalleryImages);
      }
    }

    // 3. Update other fields
    Object.assign(variant, updateData);
    await variant.save();

    // 4. SYNC LOGIC
    const product = await Product.findById(variant.productId);

    // If this is default, or user wants to make it default
    if (
      isDefault === 'true' ||
      isDefault === true ||
      product?.defaultVariantId?.toString() === variant._id.toString()
    ) {
      await syncProductWithDefaultVariant(
        variant.productId,
        variant._id as mongoose.Types.ObjectId
      );
    }

    return httpResponse(req, res, 200, 'Variant updated and synced successfully', variant);
  } catch (error: unknown) {
    return httpError(next, error, req, 400);
  }
};

// ==========================================
// TOGGLE VARIANT STATUS
// ==========================================
export const toggleVariantStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const variant = await Variant.findById(id);
    if (!variant) throw new Error('Variant not found');

    if (variant.isDefault && variant.isActive) {
      throw new Error(
        'Cannot deactivate the default variant. Please set another variant as default first.'
      );
    }

    variant.isActive = !variant.isActive;
    await variant.save();

    return httpResponse(
      req,
      res,
      200,
      `Variant ${variant.isActive ? 'activated' : 'deactivated'} successfully`,
      variant
    );
  } catch (error: unknown) {
    return httpError(next, error, req, 400);
  }
};

// ==========================================
// DELETE VARIANT
// ==========================================
export const deleteVariant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const variant = await Variant.findById(id);
    if (!variant) throw new Error('Variant not found');

    const productId = variant.productId;

    // 1. Determine if this is the last variant
    const totalVariants = await Variant.countDocuments({ productId });
    const isLastVariant = totalVariants <= 1;

    // 2. If deleting the default variant (but not the last one), promote another one
    if (variant.isDefault && !isLastVariant) {
      const anotherVariant = await Variant.findOne({ 
        productId, 
        _id: { $ne: variant._id } 
      });

      if (anotherVariant) {
        anotherVariant.isDefault = true;
        await anotherVariant.save();
        await syncProductWithDefaultVariant(productId, anotherVariant._id as mongoose.Types.ObjectId);
      }
    } 
    // 3. If deleting the absolute LAST variant, clean up the Product document
    else if (isLastVariant) {
      await Product.findByIdAndUpdate(productId, {
        defaultVariantId: null,
        displayPrice: 0,
        displayMrp: 0,
        displayDiscount: 0,
        default_slug: null,
        coverImage: null,
        isPublished: false, // Auto-unpublish if no variants remain
      });
    }

    // 4. Clean Cloudinary
    if (variant.coverImage?.publicId)
      await cloudinaryService.deleteFile(variant.coverImage.publicId);
    if (variant.imagesArray && variant.imagesArray.length > 0) {
      await Promise.all(
        variant.imagesArray.map((img) => cloudinaryService.deleteFile(img.publicId))
      );
    }

    await Variant.findByIdAndDelete(id);

    return httpResponse(req, res, 200, 'Variant deleted successfully');
  } catch (error: unknown) {
    return httpError(next, error, req, 400);
  }
};

// ==========================================
// SEARCH VARIANTS (With isDefault Boosting)
// ==========================================
export const searchVariants = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search = '', page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    if (!search) return httpResponse(req, res, 200, 'Empty search', { results: [] });

    const searchTerm = search as string;

    const searchResults = await Variant.aggregate([
      {
        $match: {
          isActive: true,
          $or: [
            { title: { $regex: searchTerm, $options: 'i' } },
            { sku: { $regex: searchTerm, $options: 'i' } }
          ]
        },
      },

      // Filter by Published Product (unless Admin/Staff)
      {
        $lookup: {
          from: 'products',
          localField: 'productId',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: '$product' },
      {
        $match: (req as any).user?.role === 'admin' || (req as any).user?.role === 'staff'
          ? {} // Admins see everything
          : { 'product.isPublished': true },
      },

      {
        $addFields: {
          textScore: { $meta: 'textScore' },
          defaultBoost: { $cond: [{ $eq: ['$isDefault', true] }, 50, 0] },
        },
      },
      {
        $addFields: {
          relevanceScore: { $add: ['$textScore', '$defaultBoost'] },
        },
      },

      { $sort: { relevanceScore: -1, price: 1 } },

      // 4. GROUP BY PRODUCT (Roll-up)
      {
        $group: {
          _id: '$productId',
          bestVariant: { $first: '$$ROOT' }, // Grabs the highest relevance score!
          variantCount: { $sum: 1 },
          allVariantIds: { $push: '$_id' },
        },
      },

      // 5. RECONSTRUCT ROOT
      {
        $replaceRoot: {
          newRoot: {
            $mergeObjects: [
              '$bestVariant',
              {
                hasMultipleVariants: { $gt: ['$variantCount', 1] },
                totalVariants: '$variantCount',
                variantIds: '$allVariantIds',
              },
            ],
          },
        },
      },

      // 6. PAGINATION
      { $skip: skip },
      { $limit: Number(limit) },

      // 7. PROJECT (Lightweight Payload)
      {
        $project: {
          title: 1,
          price: 1,
          mrp: 1,
          coverImage: 1,
          attributes: 1,
          productId: 1,
          isDefault: 1, // Let the frontend know this is the default item
          relevanceScore: 1,
          textScore: 1, // Keep this during development to debug your search!
          hasMultipleVariants: 1,
          totalVariants: 1,
        },
      },
    ]);

    // 8. POPULATE PRODUCT DATA
    await Variant.populate(searchResults, {
      path: 'productId',
      select: 'title categoryId brandId default_slug displayPrice displayMrp displayDiscount rating numReviews',
      populate: [
        { path: 'brandId', select: 'name' },
        { path: 'categoryId', select: 'name' },
      ],
    });

    return httpResponse(req, res, 200, 'Search successful', {
      results: searchResults,
      count: searchResults.length,
    });
  } catch (error: unknown) {
    return httpError(next, error, req, 500);
  }
};
