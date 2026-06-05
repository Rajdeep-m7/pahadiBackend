import mongoose, { PipelineStage } from 'mongoose';
import { Variant } from '@/api/v1/models/variant.model';
import { Product } from '@/api/v1/models/product.model';

export interface AttributeFilter {
  [key: string]: string[];
}

/**
 * Resolves attribute filters to productIds using variant data.
 *
 * Filter Logic:
 * - OR within same attribute key: Color: [Black, Red] → Black OR Red
 * - AND across attribute keys: Color: Black, RAM: 16GB → Black AND 16GB
 *
 * Returns array of product IDs that have at least one matching variant.
 */
export const resolveAttributeFilters = async (
  categoryIds: string[],
  attributes: AttributeFilter
): Promise<string[]> => {
  if (!attributes || Object.keys(attributes).length === 0) {
    return []; // No filter, all products pass
  }

  // Build $or/$and conditions for attributes
  const conditions: Record<string, unknown>[] = [];

  for (const [key, values] of Object.entries(attributes)) {
    // Normalize to array: handle both "Color": "white" and "Color": ["white"]
    const valueArray = Array.isArray(values) ? values : [values];

    // OR within same key: Color = "Black" OR Color = "Red"
    if (valueArray.length > 0) {
      const valueConditions = valueArray.map((value) => ({
        [`attributes.${key}`]: value,
      }));
      conditions.push({ $or: valueConditions });
    }
  }

  // If no valid conditions, return empty (no filtering)
  if (conditions.length === 0) {
    return [];
  }

  // AND across keys: (Color=Black OR Color=Red) AND (RAM=16GB OR RAM=32GB)
  const pipeline: PipelineStage[] = [
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
      $match: {
        'product.categoryId': { $in: categoryIds.map((id) => new mongoose.Types.ObjectId(id)) },
        'product.isPublished': true,
        'product.isActive': true,
        isActive: true,
        $and: conditions,
      },
    },
    {
      $group: {
        _id: '$productId',
      },
    },
  ];

  const results = await Variant.aggregate(pipeline);
  return results.map((r) => r._id.toString());
};

/**
 * Validates that a subcategoryId is a descendant of the parent category.
 */
export const validateSubcategory = async (
  subcategoryId: string,
  parentCategoryIds: string[]
): Promise<boolean> => {
  const productCount = await Product.countDocuments({
    _id: new mongoose.Types.ObjectId(subcategoryId),
    categoryId: { $in: parentCategoryIds.map((id) => new mongoose.Types.ObjectId(id)) },
  });

  return productCount > 0;
};