import { Request, Response, NextFunction } from 'express';
import { Category } from '@/api/v1/models/category.model';
import { Product } from '@/api/v1/models/product.model';
import { cloudinaryService } from '@/api/v1/services/cloudinary.service';
import { httpError } from '@/api/v1/utils/httpError';
import httpResponse from '@/api/v1/utils/httpResponse';
import { UploadedFile } from 'express-fileupload';
import { validateFileSize } from '@/api/v1/utils/fileValidation';

import { Types } from 'mongoose';
import { ICategory } from '@/api/v1/interfaces/category.interface';

interface ICategoryWithId extends ICategory {
  _id: Types.ObjectId;
}

const MAX_CATEGORY_LEVEL = 5;

// ==========================================
// HELPERS
// ==========================================

/**
 * Recursively builds a category tree
 */
const buildTree = (categories: ICategoryWithId[], parentId: string | null = null): ICategory[] => {
  return categories
    .filter((cat) => String(cat.parentCategoryId || null) === String(parentId || null))
    .map((cat) => ({
      ...cat,
      children: buildTree(categories, cat._id.toString()),
    }));
};

/**
 * Gets the level of a category (0 for Root, 1 for Child, etc.)
 */
const getCategoryLevel = async (categoryId: string | null): Promise<number> => {
  if (!categoryId || categoryId === 'null') return -1;
  let level = 0;
  let currentId = categoryId;
  while (currentId) {
    const cat = await Category.findById(currentId).lean();
    if (!cat || !cat.parentCategoryId) break;
    level++;
    currentId = cat.parentCategoryId.toString();
    if (level > 5) break; // Safety break
  }
  return level;
};

/**
 * Gets the maximum height of the subtree rooted at categoryId
 */
const getCategoryHeight = async (categoryId: string): Promise<number> => {
  const children = await Category.find({ parentCategoryId: categoryId }).lean();
  if (children.length === 0) return 0;

  let maxHeight = 0;
  for (const child of children) {
    const h = await getCategoryHeight(child._id.toString());
    if (h + 1 > maxHeight) maxHeight = h + 1;
  }
  return maxHeight;
};

/**
 * Computes depth and subtree height for all categories in-memory (no extra DB queries).
 * Returns a map: categoryId -> { depth, subtreeHeight }
 */
const computeAllDepthsAndHeights = (
  categories: { _id: Types.ObjectId; parentCategoryId: Types.ObjectId | null }[]
): Map<string, { depth: number; subtreeHeight: number }> => {
  const map = new Map<string, { _id: Types.ObjectId; parentCategoryId: Types.ObjectId | null }>();
  categories.forEach(cat => map.set(cat._id.toString(), cat));

  // First pass: compute depth for each category
  const depthMap = new Map<string, number>();
  const computeDepth = (catId: string): number => {
    if (depthMap.has(catId)) return depthMap.get(catId)!;
    const cat = map.get(catId);
    if (!cat || !cat.parentCategoryId) {
      depthMap.set(catId, 0);
      return 0;
    }
    const d = computeDepth(cat.parentCategoryId.toString()) + 1;
    depthMap.set(catId, d);
    return d;
  };

  // Compute depths for all categories
  map.forEach((_, catId) => computeDepth(catId));

  // Second pass: post-order traversal to compute subtree heights
  // Build children adjacency list
  const childrenMap = new Map<string, string[]>();
  map.forEach((cat, catId) => {
    if (cat.parentCategoryId) {
      const parentId = cat.parentCategoryId.toString();
      if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
      childrenMap.get(parentId)!.push(catId);
    }
  });

  const heightMap = new Map<string, number>();
  const computeHeight = (catId: string): number => {
    if (heightMap.has(catId)) return heightMap.get(catId)!;
    const children = childrenMap.get(catId) || [];
    if (children.length === 0) {
      heightMap.set(catId, 0);
      return 0;
    }
    let maxHeight = 0;
    for (const childId of children) {
      const h = computeHeight(childId) + 1;
      if (h > maxHeight) maxHeight = h;
    }
    heightMap.set(catId, maxHeight);
    return maxHeight;
  };

  map.forEach((_, catId) => computeHeight(catId));

  const result = new Map<string, { depth: number; subtreeHeight: number }>();
  map.forEach((_, catId) => {
    result.set(catId, { depth: depthMap.get(catId)!, subtreeHeight: heightMap.get(catId)! });
  });

  return result;
};

/**
 * Recursively gets all descendant IDs of a category
 */
/**
 * Resolves the effective tax for a category by walking up the ancestor chain.
 * Returns the nearest ancestor's tax (nearest-ancestor-wins rule).
 */
export const resolveCategoryTax = async (
  category: { taxes?: { name: string; slab: number }[]; parentCategoryId?: Types.ObjectId | null }
): Promise<{ name: string; slab: number }[] | null> => {
  if (category.taxes && category.taxes.length > 0) return category.taxes;
  if (!category.parentCategoryId) return null;

  const parent = await Category.findById(category.parentCategoryId).lean();
  if (!parent) return null;
  return resolveCategoryTax(parent);
};

/**
 * Attaches effectiveTax to a plain category object by resolving from the DB.
 */
const attachEffectiveTax = async (
  category: { taxes?: { name: string; slab: number }[]; parentCategoryId?: Types.ObjectId | null; toObject?: () => Record<string, unknown> }
): Promise<Record<string, unknown>> => {
  const obj = category.toObject ? category.toObject() : category as unknown as Record<string, unknown>;
  const resolved = await resolveCategoryTax(category);
  return { ...obj, effectiveTax: resolved };
};

export const getDescendantIds = async (categoryId: string): Promise<string[]> => {
  const children = await Category.find({ parentCategoryId: categoryId }).lean();
  let ids = children.map((child) => child._id.toString());
  for (const child of children) {
    const descendantIds = await getDescendantIds(child._id.toString());
    ids = ids.concat(descendantIds);
  }
  return ids;
};

// ==========================================
// CREATE CATEGORY
// ==========================================
export const createCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, slug, parentCategoryId, taxes } = req.body;

    if (parentCategoryId) {
      const parentLevel = await getCategoryLevel(parentCategoryId);
      if (parentLevel >= MAX_CATEGORY_LEVEL) {
        throw new Error(`Maximum category depth reached. A category at level ${MAX_CATEGORY_LEVEL} cannot be a parent.`);
      }
    }

    if (!req.files || !req.files.image) {
      throw new Error('Category image is required');
    }

    const image = req.files.image as UploadedFile;
    validateFileSize(image);

    const uploadResult = await cloudinaryService.uploadFile(
      image.tempFilePath,
      'categories',
      image.mimetype
    );

    let iconUrl, iconPublicId;
    if (req.files.icon) {
      const icon = req.files.icon as UploadedFile;
      validateFileSize(icon);
      const iconUploadResult = await cloudinaryService.uploadFile(
        icon.tempFilePath,
        'category-icons',
        icon.mimetype
      );
      iconUrl = iconUploadResult.secure_url;
      iconPublicId = iconUploadResult.public_id;
    }

    const newCategory = await Category.create({
      name,
      slug,
      imageUrl: uploadResult.secure_url,
      imagePublicId: uploadResult.public_id,
      iconUrl,
      iconPublicId,
      parentCategoryId: parentCategoryId || null,
      taxes: taxes || [],
    });

    const resolvedTax = await resolveCategoryTax(newCategory);
    const categoryWithTax = { ...newCategory.toObject(), effectiveTax: resolvedTax };

    return httpResponse(req, res, 201, 'Category created successfully', categoryWithTax);
  } catch (error: unknown) {
    return httpError(next, error, req, 400);
  }
};

// ==========================================
// GET ELIGIBLE PARENT CATEGORIES
// ==========================================
export const getEligibleParents = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, categoryId } = req.query;

    const allCategories = await Category.find().lean();
    const statsMap = computeAllDepthsAndHeights(allCategories as { _id: Types.ObjectId; parentCategoryId: Types.ObjectId | null }[]);

    const eligibleParents = allCategories.filter(cat => {
      const stats = statsMap.get(cat._id.toString());
      if (!stats) return false;
      return stats.depth + 1 + stats.subtreeHeight <= MAX_CATEGORY_LEVEL;
    });

    let result = eligibleParents;

    if (search) {
      const searchRegex = new RegExp(search as string, 'i');
      result = result.filter((cat) => searchRegex.test(cat.name));
    }

    if (categoryId) {
      const excludeIds = [categoryId as string, ...(await getDescendantIds(categoryId as string))];
      result = result.filter((cat) => !excludeIds.includes(cat._id.toString()));
    }

    result.sort((a, b) => a.name.localeCompare(b.name));

    const withEffectiveTax = await Promise.all(result.map(attachEffectiveTax));

    return httpResponse(req, res, 200, 'Eligible parent categories fetched', withEffectiveTax);
  } catch (error: unknown) {
    return httpError(next, error, req, 500);
  }
};

// ==========================================
// GET ALL CATEGORIES
// ==========================================
export const getAllCategories = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, parentCategoryId, tree } = req.query;

    // If tree=true is requested, or if no filters are provided, return tree structure
    if (tree === 'true' || (!search && parentCategoryId === undefined)) {
      const allCategories = (await Category.find()
        .sort({ name: 1 })
        .lean()) as unknown as ICategoryWithId[];
      const categoryTree = buildTree(allCategories, null);
      return httpResponse(req, res, 200, 'Categories fetched successfully', categoryTree);
    }

    const filter: { name?: unknown; parentCategoryId?: unknown } = {};

    if (search) {
      filter.name = { $regex: search, $options: 'i' };
    }

    if (parentCategoryId !== undefined) {
      filter.parentCategoryId = parentCategoryId === 'null' ? null : parentCategoryId;
    }

    const categories = await Category.find(filter)
      .populate('parentCategoryId', 'name')
      .sort({ name: 1 });

    const withEffectiveTax = await Promise.all(categories.map((c) => attachEffectiveTax(c.toObject())));

    return httpResponse(req, res, 200, 'Categories fetched successfully', withEffectiveTax);
  } catch (error: unknown) {
    return httpError(next, error, req, 500);
  }
};

// ==========================================
// GET CATEGORY BY ID
// ==========================================
export const getCategoryById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const category = await Category.findById(req.params.id).populate('parentCategoryId', 'name');
    if (!category) throw new Error('Category not found');

    const resolvedTax = await resolveCategoryTax(category);
    const categoryWithTax = { ...category.toObject(), effectiveTax: resolvedTax };

    return httpResponse(req, res, 200, 'Category fetched successfully', categoryWithTax);
  } catch (error: unknown) {
    return httpError(next, error, req, 404);
  }
};

// ==========================================
// UPDATE CATEGORY
// ==========================================
export const updateCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { name, slug, parentCategoryId, taxes } = req.body;

    const category = await Category.findById(id);
    if (!category) throw new Error('Category not found');

    // Check depth limit if parent is changing
    if (parentCategoryId !== undefined) {
      const newParentId = parentCategoryId || null;

      if (newParentId && String(newParentId) !== String(category.parentCategoryId || '')) {
        // Prevent self-parenting
        if (String(newParentId) === String(id)) {
          throw new Error('A category cannot be its own parent.');
        }

        const newParentLevel = await getCategoryLevel(newParentId.toString());
        const currentHeight = await getCategoryHeight(id as string);

        if (newParentLevel + 1 + currentHeight > MAX_CATEGORY_LEVEL) {
          throw new Error(
            `Maximum category depth reached. Moving this category would exceed the ${MAX_CATEGORY_LEVEL + 1}-level limit.`
          );
        }
      }
    }

    if (name) category.name = name;
    if (slug) category.slug = slug;
    if (parentCategoryId !== undefined) category.parentCategoryId = parentCategoryId || null;
    if (taxes !== undefined) category.taxes = taxes;

    if (req.files && req.files.image) {
      const image = req.files.image as UploadedFile;
      validateFileSize(image);

      // Delete old image if exists
      if (category.imagePublicId) {
        await cloudinaryService.deleteFile(category.imagePublicId);
      }

      const uploadResult = await cloudinaryService.uploadFile(
        image.tempFilePath,
        'categories',
        image.mimetype
      );
      category.imageUrl = uploadResult.secure_url;
      category.imagePublicId = uploadResult.public_id;
    }

    if (req.files && req.files.icon) {
      const icon = req.files.icon as UploadedFile;
      validateFileSize(icon);

      // Delete old icon if exists
      if (category.iconPublicId) {
        await cloudinaryService.deleteFile(category.iconPublicId);
      }

      const iconUploadResult = await cloudinaryService.uploadFile(
        icon.tempFilePath,
        'category-icons',
        icon.mimetype
      );
      category.iconUrl = iconUploadResult.secure_url;
      category.iconPublicId = iconUploadResult.public_id;
    }

    await category.save();

    const resolvedTax = await resolveCategoryTax(category);
    const categoryWithTax = { ...category.toObject(), effectiveTax: resolvedTax };

    return httpResponse(req, res, 200, 'Category updated successfully', categoryWithTax);
  } catch (error: unknown) {
    return httpError(next, error, req, 400);
  }
};

// ==========================================
// DELETE CATEGORY
// ==========================================
export const deleteCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // 1. Check if any subcategory is linked to this category
    const childCategoriesCount = await Category.countDocuments({ parentCategoryId: id });
    if (childCategoriesCount > 0) {
      throw new Error(`Cannot delete category. It has ${childCategoriesCount} subcategory(ies).`);
    }

    // 2. Check if any product is linked to this category
    const linkedProductsCount = await Product.countDocuments({ categoryId: id });
    if (linkedProductsCount > 0) {
      throw new Error(`Cannot delete category. It is linked to ${linkedProductsCount} product(s).`);
    }

    const category = await Category.findById(id);
    if (!category) throw new Error('Category not found');

    // 3. Delete image from Cloudinary
    if (category.imagePublicId) {
      await cloudinaryService.deleteFile(category.imagePublicId);
    }

    // Delete icon from Cloudinary if exists
    if (category.iconPublicId) {
      await cloudinaryService.deleteFile(category.iconPublicId);
    }

    // 4. Delete from DB
    await Category.findByIdAndDelete(id);

    return httpResponse(req, res, 200, 'Category deleted successfully');
  } catch (error: unknown) {
    return httpError(next, error, req, 400);
  }
};
