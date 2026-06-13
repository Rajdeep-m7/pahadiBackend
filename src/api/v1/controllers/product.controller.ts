import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { Product } from '@/api/v1/models/product.model';
import { Variant } from '@/api/v1/models/variant.model';
import { Brand } from '@/api/v1/models/brand.model';
import { Category } from '@/api/v1/models/category.model';
import { getDescendantIds, resolveCategoryTax } from '@/api/v1/controllers/category.controller';
import { resolveAttributeFilters } from '@/api/v1/services/productFilters.service';
import { WarehouseLocation } from '@/api/v1/models/warehouse.model';
import { cloudinaryService } from '@/api/v1/services/cloudinary.service';
import { httpError } from '@/api/v1/utils/httpError';
import httpResponse from '@/api/v1/utils/httpResponse';
import { UploadedFile } from 'express-fileupload';
import { validateFileSize } from '@/api/v1/utils/fileValidation';
import { AuthRequest } from '@/api/v1/interfaces/auth.interface';

/**
 * Resolves a product's effective tax:
 * - If product has its own taxes (non-empty), return those
 * - Else resolve from the product's category via resolveCategoryTax
 * - Return null if no tax anywhere
 */
const resolveProductEffectiveTax = async (
  product: { taxes?: { name: string; slab: number }[]; categoryId?: any }
): Promise<{ name: string; slab: number }[] | null> => {
  if (product.taxes && product.taxes.length > 0) return product.taxes;
  if (!product.categoryId) return null;

  // If categoryId is already populated as an object
  if (typeof product.categoryId === 'object' && product.categoryId.name) {
    return resolveCategoryTax(product.categoryId);
  }

  const category = await Category.findById(product.categoryId).lean();
  if (!category) return null;
  return resolveCategoryTax(category);
};

// ==========================================
// CREATE PRODUCT
// ==========================================
export const createProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      title,
      desc,
      specs,
      brandId,
      categoryId,
      pickupWareHouseId,
      returnPolicyType,
      returnWindowDays,
      isPublished,
      isTaxInclude,
      taxes,
    } = req.body;

    const [brandExists, categoryExists, warehouseExists] = await Promise.all([
      Brand.exists({ _id: brandId }),
      Category.exists({ _id: categoryId }),
      WarehouseLocation.exists({ _id: pickupWareHouseId }),
    ]);

    if (!brandExists) throw new Error('Invalid Brand ID');
    if (!categoryExists) throw new Error('Invalid Category ID');
    if (!warehouseExists) throw new Error('Invalid Warehouse ID');

    // 2. Handle File Uploads
    let coverImage;
    if (req.files && req.files.coverImage) {
      const coverImageFile = req.files.coverImage as UploadedFile;
      validateFileSize(coverImageFile);

      const coverUpload = await cloudinaryService.uploadFile(
        coverImageFile.tempFilePath,
        'products/covers',
        coverImageFile.mimetype
      );
      coverImage = {
        url: coverUpload.secure_url,
        publicId: coverUpload.public_id,
      };
    }

    const isPublishedBool = isPublished === 'true' || isPublished === true;
    if (isPublishedBool) {
      throw new Error('Product cannot be published without variants. Create variants first.');
    }

    const productData = {
      title,
      desc,
      specs,
      brandId,
      categoryId,
      pickupWareHouseId,
      returnPolicyType,
      returnWindowDays,
      isPublished: false,
      isTaxInclude: isTaxInclude === 'true' || isTaxInclude === true,
      taxes,
      coverImage,
    };

    const newProduct = await Product.create(productData);

    return httpResponse(req, res, 201, 'Product created successfully', newProduct);
  } catch (error: unknown) {
    return httpError(next, error, req, 400);
  }
};

// ==========================================
// GET ALL PRODUCTS (Optimized)
// ==========================================

const toObjectId = (value: unknown) => {
  if (typeof value === 'string' && mongoose.Types.ObjectId.isValid(value)) {
    return new mongoose.Types.ObjectId(value);
  }
  return undefined;
};

interface IProductFilter {
  _id?: { $in: string[] };
  brandId?: mongoose.Types.ObjectId | { $in: mongoose.Types.ObjectId[] };
  categoryId?:
    | mongoose.Types.ObjectId
    | { $in: (mongoose.Types.ObjectId | string | mongoose.Types.ObjectId)[] };
  isActive?: boolean;
  isPublished?: boolean;
  title?: { $regex: string; $options: string };
  displayPrice?: { $gte?: number; $lte?: number };
}

export const getProducts = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const {
      page = '1',
      limit = '10',
      brandId,
      categoryId,
      search,
      isActive,
      isPublished,
    } = req.query;
    const filter: IProductFilter = {};

    const brandObjectId = toObjectId(brandId);
    if (brandObjectId) filter.brandId = brandObjectId;

    const categoryObjectId = toObjectId(categoryId);
    if (categoryObjectId) {
      const descendantIds = await getDescendantIds(categoryObjectId.toString());
      filter.categoryId = { $in: [categoryObjectId, ...descendantIds] };
    }
    if (isActive) filter.isActive = isActive === 'true';
    if(isPublished) filter.isPublished= isPublished==='true';

    // Role-based Publication Filter
    // const userRole = req.user?.role;
    // if (userRole && ['admin', 'staff'].includes(userRole)) {
    //   if (isPublished !== undefined) {
    //     filter.isPublished = isPublished === 'true';
    //   }
    //   // Admins/Staff see both by default if not specified
    // } else {
      // }
    // filter.isPublished = true;

    if (search) filter.title = { $regex: search as string, $options: 'i' };

    const skip = (Number(page) - 1) * Number(limit);

    const products = await Product.find(filter)
      .select(
        'title coverImage displayPrice displayMrp displayDiscount defaultVariantId default_slug brandId categoryId isActive isPublished isTaxInclude taxes rating numReviews'
      )
      .populate('brandId', 'name')
      .populate('categoryId', 'name parentCategoryId taxes') // Fully populate for tax resolution
      .populate('defaultVariantId', 'stocks _id') // Populate stock for frontend
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const categoryIds = [...new Set(
      products.map((p) => p.categoryId?._id?.toString()).filter(Boolean) as string[]
    )];
    const categoryDocs = await Category.find({ _id: { $in: categoryIds } }).lean();
    const categoryTaxMap = new Map<string, { name: string; slab: number }[] | null>();
    for (const cat of categoryDocs) {
      categoryTaxMap.set(cat._id.toString(), null);
    }

    const productsWithTax = await Promise.all(
      products.map(async (p) => {
        const effectiveTax = await resolveProductEffectiveTax(p);
        return { ...p.toObject(), effectiveTax };
      })
    );

    const total = await Product.countDocuments(filter);

    return httpResponse(req, res, 200, 'Products fetched successfully', {
      total,
      page: Number(page),
      limit: Number(limit),
      products: productsWithTax,
    });
  } catch (error: unknown) {
    return httpError(next, error, req, 500);
  }
};

// ==========================================
// GET PRODUCTS BY CATEGORY SLUG (With Filtering, Pagination, Sorting)
// ==========================================
export const getProductByCategorySlug = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { slug } = req.params;
    const {
      page = 1,
      limit = 10,
      brandId,
      search,
      minPrice,
      maxPrice,
      sortBy = 'newest',
      subcategoryId,
      attributes,
    } = req.query;

    // 1. Find the category by slug
    const category = await Category.findOne({ slug });
    if (!category) throw new Error('Category not found');

    // 2. Get all descendants (Subcategories)
    const descendantIds = await getDescendantIds(category._id.toString());
    const categoryIds: string[] = [category._id.toString(), ...descendantIds];

    // 3. Build Filter
    const filter: IProductFilter = {
      categoryId: { $in: categoryIds },
      isActive: true,
    };

    // Role-based Publication Filter
    filter.isPublished = true;
    filter.isActive = true;

    // 4. Subcategory filter (must be descendant of parent category)
    if (subcategoryId) {
      const subcatObjectId = toObjectId(subcategoryId);
      if (subcatObjectId && categoryIds.includes(subcatObjectId.toString())) {
        filter.categoryId = subcatObjectId;
      }
    }

    // 5. Brand filter (comma-separated: "id1,id2,id3")
    if (brandId) {
      const brandIds = (brandId as string).split(',').map((id) => id.trim()).filter(Boolean);
      if (brandIds.length > 0) {
        const validBrandIds = brandIds
          .map((id) => toObjectId(id))
          .filter((id): id is mongoose.Types.ObjectId => id !== undefined);

        if (validBrandIds.length > 0) {
          filter.brandId = { $in: validBrandIds };
        }
      }
    }

    // 6. Search filter
    if (search) {
      filter.title = { $regex: search as string, $options: 'i' };
    }

    // 7. Price range filter
    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.displayPrice = {};
      if (minPrice !== undefined) filter.displayPrice.$gte = Number(minPrice);
      if (maxPrice !== undefined) filter.displayPrice.$lte = Number(maxPrice);
    }

    // 8. Attribute filters (variant-to-product resolution)
    let attributeFilterIds: string[] = [];
    if (attributes) {
      try {
        const parsedAttributes = JSON.parse(attributes as string);
        if (parsedAttributes && typeof parsedAttributes === 'object') {
          attributeFilterIds = await resolveAttributeFilters(categoryIds, parsedAttributes);
          if (attributeFilterIds.length > 0) {
            filter._id = { $in: attributeFilterIds };
          }
        }
      } catch (e) {
        console.error('Attribute filter error:', e);
        // Invalid JSON, ignore attribute filter
      }
    }

    // 9. Sorting logic
    let sortOption: Record<string, 1 | -1> = { createdAt: -1 };
    if (sortBy === 'price-asc') sortOption = { displayPrice: 1 };
    else if (sortBy === 'price-desc') sortOption = { displayPrice: -1 };
    else if (sortBy === 'newest') sortOption = { createdAt: -1 };
    else if (sortBy === 'oldest') sortOption = { createdAt: 1 };
    else if (sortBy === 'discount') sortOption = { displayDiscount: -1 };

    // 10. Execution
    const skip = (Number(page) - 1) * Number(limit);

    const products = await Product.find(filter)
      .select(
        'title coverImage displayPrice displayMrp displayDiscount defaultVariantId default_slug brandId categoryId isActive isPublished isTaxInclude taxes rating numReviews'
      )
      .populate('brandId', 'name')
      .populate('categoryId', 'name slug parentCategoryId taxes') // Fully populate for tax resolution
      .populate('defaultVariantId', 'stocks _id') // Populate stock for frontend
      .sort(sortOption)
      .skip(skip)
      .limit(Number(limit));

    const productsWithTax = await Promise.all(
      products.map(async (p) => {
        const effectiveTax = await resolveProductEffectiveTax(p);
        return { ...p.toObject(), effectiveTax };
      })
    );

    const total = await Product.countDocuments(filter);

    return httpResponse(req, res, 200, 'Products by category fetched successfully', {
      total,
      page: Number(page),
      limit: Number(limit),
      products: productsWithTax,
    });
  } catch (error: unknown) {
    return httpError(next, error, req, 500);
  }
};

// ==========================================
// GET PRODUCT BY ID (Full Detail)
// ==========================================
export const getProductById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('categoryId', 'name slug')
      .populate('brandId', 'name logoUrl')
      .populate('pickupWareHouseId', 'name city state pinCode');

    if (!product) throw new Error('Product not found');

    // Hide unpublished from customers
    const userRole = req.user?.role;
    if (!product.isPublished && (!userRole || !['admin', 'staff'].includes(userRole))) {
      throw new Error('Product not found');
    }

    const effectiveTax = await resolveProductEffectiveTax(product);
    const productWithTax = { ...product.toObject(), effectiveTax };

    return httpResponse(req, res, 200, 'Product details fetched successfully', productWithTax);
  } catch (error: unknown) {
    return httpError(next, error, req, 404);
  }
};

// ==========================================
// UPDATE PRODUCT
// ==========================================
export const updateProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const {
      title,
      desc,
      specs,
      brandId,
      categoryId,
      pickupWareHouseId,
      returnPolicyType,
      returnWindowDays,
      isActive,
      isPublished,
      isTaxInclude,
      taxes,
    } = req.body;

    const product = await Product.findById(id);
    if (!product) throw new Error('Product not found');

    // 2. Validate References if they are being updated
    if (brandId || categoryId || pickupWareHouseId) {
      const checks = [];
      if (brandId) checks.push(Brand.exists({ _id: brandId }));
      if (categoryId) checks.push(Category.exists({ _id: categoryId }));
      if (pickupWareHouseId) checks.push(WarehouseLocation.exists({ _id: pickupWareHouseId }));

      const results = await Promise.all(checks);
      if (results.some((r) => !r)) throw new Error('One or more referenced IDs are invalid');
    }

    // 3. Handle File Updates
    if (req.files) {
      if (req.files.coverImage) {
        const file = req.files.coverImage as UploadedFile;
        validateFileSize(file);

        // Delete old cover image from Cloudinary
        if (product.coverImage?.publicId) {
          await cloudinaryService.deleteFile(product.coverImage.publicId);
        }

        const upload = await cloudinaryService.uploadFile(
          file.tempFilePath,
          'products/covers',
          file.mimetype
        );
        product.coverImage = {
          url: upload.secure_url,
          publicId: upload.public_id,
        };
      }
    }

    // 4. Update other fields
    if (title !== undefined) product.title = title;
    if (desc !== undefined) product.desc = desc;
    if (specs !== undefined) product.specs = specs;
    if (brandId !== undefined) product.brandId = brandId;
    if (categoryId !== undefined) product.categoryId = categoryId;
    if (pickupWareHouseId !== undefined) product.pickupWareHouseId = pickupWareHouseId;
    if (returnPolicyType !== undefined) product.returnPolicyType = returnPolicyType;
    if (returnWindowDays !== undefined) product.returnWindowDays = returnWindowDays;
    if (isActive !== undefined) product.isActive = isActive === 'true' || isActive === true;
    if (isPublished !== undefined) {
      const wantToPublish = isPublished === 'true' || isPublished === true;
      if (wantToPublish) {
        const hasVariants = await Variant.exists({ productId: id });
        if (!hasVariants) {
          throw new Error('Product cannot be published without variants. Create variants first.');
        }
      }
      product.isPublished = wantToPublish;
    }
    if (isTaxInclude !== undefined)
      product.isTaxInclude = isTaxInclude === 'true' || isTaxInclude === true;
    if (taxes !== undefined) product.taxes = taxes;

    await product.save();

    const effectiveTax = await resolveProductEffectiveTax(product);
    const productWithTax = { ...product.toObject(), effectiveTax };

    return httpResponse(req, res, 200, 'Product updated successfully', productWithTax);
  } catch (error: unknown) {
    return httpError(next, error, req, 400);
  }
};

// ==========================================
// PUBLISH PRODUCT
// ==========================================
export const publishProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const hasVariants = await Variant.exists({ productId: id });
    if (!hasVariants) {
      throw new Error('Product cannot be published without variants. Create variants first.');
    }

    const product = await Product.findByIdAndUpdate(id, { isPublished: true }, { returnDocument: 'after' });

    if (!product) throw new Error('Product not found');

    return httpResponse(req, res, 200, 'Product published successfully', product);
  } catch (error: unknown) {
    return httpError(next, error, req, 400);
  }
};

// ==========================================
// DELETE PRODUCT
// ==========================================
export const deleteProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // Critical Danger: Dependency check for Variants
    const variantCount = await Variant.countDocuments({ productId: id });
    if (variantCount > 0) {
      throw new Error(
        `Cannot delete product. It has ${variantCount} linked variant(s). Delete variants first.`
      );
    }

    const product = await Product.findByIdAndDelete(id);
    if (!product) throw new Error('Product not found');

    // Clean up images from Cloudinary
    if (product.coverImage?.publicId) {
      await cloudinaryService.deleteFile(product.coverImage.publicId);
    }

    return httpResponse(req, res, 200, 'Product and media cleared successfully');
  } catch (error: unknown) {
    return httpError(next, error, req, 400);
  }
};

// ==========================================
// GET SIMILAR PRODUCTS (Weighted Relevance Engine)
// ==========================================
export const getSimilarProducts = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // 1. Fetch base product to get the targets
    const baseProduct = await Product.findById(id).select('categoryId brandId');
    if (!baseProduct) throw new Error('Base product not found');

    const baseCategoryId = baseProduct.categoryId;
    const baseBrandId = baseProduct.brandId;
    const baseProductId = baseProduct._id;

    const userRole = req.user?.role;
    const publicationFilter =
      userRole && ['admin', 'staff'].includes(userRole) ? {} : { isPublished: true };

    // 2. The Recommendation Engine (Aggregation Pipeline)
    const similarProducts = await Product.aggregate([
      // Step A: Broad Match (Get anything with same category OR same brand)
      {
        $match: {
          _id: { $ne: baseProductId }, // Do not recommend the exact same product
          isActive: true,
          ...publicationFilter,
          $or: [{ categoryId: baseCategoryId }, { brandId: baseBrandId }],
        },
      },
      // Step B: The Scoring System
      {
        $addFields: {
          relevanceScore: {
            $switch: {
              branches: [
                // Tier 1 (Score 3): Exact Match (Same Category AND Same Brand)
                {
                  case: {
                    $and: [
                      { $eq: ['$categoryId', baseCategoryId] },
                      { $eq: ['$brandId', baseBrandId] },
                    ],
                  },
                  then: 3,
                },
                // Tier 2 (Score 2): Same Category only (e.g. Asus Laptop -> Dell Laptop)
                {
                  case: { $eq: ['$categoryId', baseCategoryId] },
                  then: 2,
                },
                // Tier 3 (Score 1): Same Brand only (e.g. Asus Laptop -> Asus Mouse)
                {
                  case: { $eq: ['$brandId', baseBrandId] },
                  then: 1,
                },
              ],
              default: 0,
            },
          },
        },
      },
      // Step C: Rank them! Highest score first. If tied, show the newest product.
      { $sort: { relevanceScore: -1, createdAt: -1 } },

      // Step D: Limit to 5 (or 6 for a balanced UI grid)
      { $limit: 6 },

      // Step E: Strip heavy payload (Exclude desc, specs, etc.)
      {
        $project: {
          title: 1,
          coverImage: 1,
          displayPrice: 1,
          displayMrp: 1,
          displayDiscount: 1,
          defaultVariantId: 1,
          default_slug: 1,
          rating: 1,
          numReviews: 1,
          relevanceScore: 1, // Optional: Keep this to debug the ranking in Postman
        },
      },
    ]);

    // 3. Populate the Variant Data
    // Aggregation pipelines strip Mongoose schemas, so we use Product.populate to restore relations
    await Product.populate(similarProducts, {
      path: 'defaultVariantId',
      select: 'price sku',
    });

    return httpResponse(req, res, 200, 'Similar products fetched successfully', similarProducts);
  } catch (error: unknown) {
    return httpError(next, error, req, 500);
  }
};
