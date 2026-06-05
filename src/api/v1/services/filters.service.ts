import mongoose, { PipelineStage } from 'mongoose';
import { Product } from '@/api/v1/models/product.model';
import { Variant } from '@/api/v1/models/variant.model';
import { Brand } from '@/api/v1/models/brand.model';
import { Category } from '@/api/v1/models/category.model';
import { getDescendantIds } from '@/api/v1/controllers/category.controller';
import {
  IBrandFilter,
  IPriceRange,
  IAttributeFilterResult,
  ICategoryFilters,
  ISearchFilters,
  ISubcategory,
} from '@/api/v1/types/filters.types';

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes - for low-scale ecommerce
const MAX_CACHE_SIZE = 50; // FIFO eviction when limit reached

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const filterCache = new Map<string, CacheEntry<unknown>>();
const cacheOrder: string[] = []; // FIFO tracking

const getCacheKey = (type: 'category' | 'search', identifier: string) => `${type}:${identifier}`;

const isExpired = (entry: CacheEntry<unknown>): boolean => Date.now() > entry.expiresAt;

const evictOldest = (): void => {
  while (filterCache.size >= MAX_CACHE_SIZE && cacheOrder.length > 0) {
    const oldest = cacheOrder.shift();
    if (oldest) {
      filterCache.delete(oldest);
    }
  }
};

const getFromCache = <T>(key: string): T | null => {
  const entry = filterCache.get(key) as CacheEntry<T> | undefined;
  if (entry && !isExpired(entry)) {
    return entry.data;
  }
  filterCache.delete(key);
  const idx = cacheOrder.indexOf(key);
  if (idx !== -1) cacheOrder.splice(idx, 1);
  return null;
};

const setCache = <T>(key: string, data: T, ttlMs: number = CACHE_TTL_MS): void => {
  // FIFO eviction before adding new entry
  evictOldest();

  filterCache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
  });

  if (!cacheOrder.includes(key)) {
    cacheOrder.push(key);
  }
};

const getCategoryIds = async (categorySlug: string): Promise<{ ids: string[]; category: InstanceType<typeof Category> } | null> => {
  const category = await Category.findOne({ slug: categorySlug });
  if (!category) return null;

  const descendantIds = await getDescendantIds(category._id.toString());
  return {
    ids: [category._id.toString(), ...descendantIds],
    category,
  };
};

const aggregateBrands = async (categoryIds: string[]): Promise<IBrandFilter[]> => {
  const pipeline: PipelineStage[] = [
    {
      $match: {
        categoryId: { $in: categoryIds.map((id) => new mongoose.Types.ObjectId(id)) },
        isActive: true,
        isPublished: true,
      },
    },
    {
      $group: {
        _id: '$brandId',
        count: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: 'brands',
        localField: '_id',
        foreignField: '_id',
        as: 'brand',
      },
    },
    { $unwind: '$brand' },
    {
      $project: {
        _id: 0,
        id: { $toString: '$_id' },
        name: '$brand.name',
        count: 1,
      },
    },
    { $sort: { count: -1 } },
  ];

  return await Product.aggregate(pipeline);
};

const aggregatePriceRange = async (categoryIds: string[]): Promise<IPriceRange> => {
  const pipeline: PipelineStage[] = [
    {
      $match: {
        categoryId: { $in: categoryIds.map((id) => new mongoose.Types.ObjectId(id)) },
      },
    },
    {
      $group: {
        _id: null,
        min: { $min: '$displayPrice' },
        max: { $max: '$displayPrice' },
      },
    },
  ];

  const results = await Product.aggregate(pipeline);
  if (results.length === 0) {
    return { min: 0, max: 0 };
  }
  return { min: results[0].min, max: results[0].max };
};

const aggregateAttributeFilters = async (
  categoryIds: string[],
  filterConfigKeys: string[]
): Promise<IAttributeFilterResult[]> => {
  if (filterConfigKeys.length === 0) return [];

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
      },
    },
    {
      $group: {
        _id: '$attributes',
        count: { $sum: 1 },
      },
    },
  ];

  const variantGroups = await Variant.aggregate(pipeline);

  const attributeCounts = new Map<string, Map<string, number>>();
  for (const group of variantGroups) {
    const attrs = group._id as Record<string, string>;
    if (!attrs || typeof attrs !== 'object') continue;

    for (const key of filterConfigKeys) {
      const value = attrs[key];
      if (!value) continue;

      if (!attributeCounts.has(key)) {
        attributeCounts.set(key, new Map());
      }
      const valueCounts = attributeCounts.get(key)!;
      valueCounts.set(value, (valueCounts.get(value) || 0) + group.count);
    }
  }

  const results: IAttributeFilterResult[] = [];
  for (const key of filterConfigKeys) {
    const valueCounts = attributeCounts.get(key);
    if (!valueCounts || valueCounts.size === 0) continue;

    const values = Array.from(valueCounts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);

    results.push({ label: key, values });
  }

  return results;
};

// System/internal attribute keys that should not be shown as filters
const INTERNAL_ATTRIBUTE_KEYS = new Set([
  'discount',
  'discounttype',
  'type',
  'stock',
  'stocks',
  'sku',
  'price',
  'mrp',
  'stockstatus',
  'status',
  'model',
  'pack of'
]);

// Attribute key is likely invalid if it's longer than this (e.g., product titles stored as attributes)
// Normal keys: Color, RAM, Storage, Size, etc. (short identifiers)
const MAX_ATTRIBUTE_KEY_LENGTH = 30;

/**
 * Auto-discovers attribute keys from variants in the category
 */
const discoverAttributeKeys = async (categoryIds: string[]): Promise<string[]> => {
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
      },
    },
    {
      $group: {
        _id: '$attributes',
      },
    },
  ];

  const variantGroups = await Variant.aggregate(pipeline);

  const allKeys = new Set<string>();
  for (const group of variantGroups) {
    const attrs = group._id as Record<string, string>;
    if (attrs && typeof attrs === 'object') {
      Object.keys(attrs).forEach((key) => {
        const normalizedKey = key.toLowerCase();
        if (
          !INTERNAL_ATTRIBUTE_KEYS.has(normalizedKey) &&
          key.length <= MAX_ATTRIBUTE_KEY_LENGTH
        ) {
          allKeys.add(key);
        }
      });
    }
  }

  return Array.from(allKeys).sort();
};

const aggregateSubcategories = async (
  categoryIds: string[]
): Promise<ISubcategory[]> => {
  // Get direct children of the main category (Level 1)
  const children = await Category.find({
    parentCategoryId: { $in: categoryIds.map((id) => new mongoose.Types.ObjectId(id)) },
  })
    .select('_id name slug')
    .lean();

  if (children.length === 0) return [];

  // Get product counts per category
  const productCounts = await Product.aggregate([
    {
      $match: {
        categoryId: { $in: children.map((c) => c._id) },
        isActive: true,
        isPublished: true,
      },
    },
    {
      $group: {
        _id: '$categoryId',
        count: { $sum: 1 },
      },
    },
  ]);

  const countMap = new Map(
    productCounts.map((p) => [p._id.toString(), p.count])
  );

  // Get grandchildren for each child
  const result: ISubcategory[] = await Promise.all(
    children.map(async (child) => {
      const grandchildren = await Category.find({
        parentCategoryId: child._id,
      })
        .select('_id name slug')
        .lean();

      let childChildren: ISubcategory[] = [];
      if (grandchildren.length > 0) {
        const gcCounts = await Product.aggregate([
          {
            $match: {
              categoryId: { $in: grandchildren.map((gc) => gc._id) },
              isActive: true,
              isPublished: true,
            },
          },
          {
            $group: {
              _id: '$categoryId',
              count: { $sum: 1 },
            },
          },
        ]);

        const gcCountMap = new Map(
          gcCounts.map((p) => [p._id.toString(), p.count])
        );

        childChildren = grandchildren.map((gc) => ({
          id: gc._id.toString(),
          name: gc.name,
          slug: gc.slug,
          productCount: gcCountMap.get(gc._id.toString()) || 0,
        }));
      }

      return {
        id: child._id.toString(),
        name: child.name,
        slug: child.slug,
        productCount: countMap.get(child._id.toString()) || 0,
        children: childChildren.length > 0 ? childChildren : undefined,
      };
    })
  );

  return result.sort((a, b) => b.productCount - a.productCount);
};

export const getCategoryFilters = async (categorySlug: string): Promise<ICategoryFilters | null> => {
  const cacheKey = getCacheKey('category', categorySlug);
  const cached = getFromCache<ICategoryFilters>(cacheKey);
  if (cached) return cached;

  const categoryData = await getCategoryIds(categorySlug);
  if (!categoryData) return null;

  const { ids: categoryIds, category } = categoryData;

  const [brands, priceRange, subcategories] = await Promise.all([
    aggregateBrands(categoryIds),
    aggregatePriceRange(categoryIds),
    aggregateSubcategories(categoryIds),
  ]);

  let attributes: IAttributeFilterResult[] = [];
  const isFilterEnabled = category.filterConfig?.enabled !== false; // default true
  const hasExplicitConfig = category.filterConfig?.attributeFilters && category.filterConfig.attributeFilters.length > 0;

  if (isFilterEnabled) {
    if (hasExplicitConfig) {
      // Use explicit config from category
      const keys = category.filterConfig!.attributeFilters!.map((f) => f.key);
      attributes = await aggregateAttributeFilters(categoryIds, keys);
    } else {
      // Auto-discover attribute keys from variants
      const discoveredKeys = await discoverAttributeKeys(categoryIds);
      if (discoveredKeys.length > 0) {
        attributes = await aggregateAttributeFilters(categoryIds, discoveredKeys);
      }
    }
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + CACHE_TTL_MS);

  const result: ICategoryFilters = {
    category: {
      id: category._id.toString(),
      name: category.name,
      slug: category.slug,
    },
    filters: {
      brands,
      priceRange,
      attributes,
    },
    subcategories,
    cachedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  setCache(cacheKey, result);
  return result;
};

export const getSearchFilters = async (): Promise<ISearchFilters> => {
  const cacheKey = getCacheKey('search', 'global');
  const cached = getFromCache<ISearchFilters>(cacheKey);
  if (cached) return cached;

  const brandsPipeline: PipelineStage[] = [
    {
      $match: { isActive: true, isPublished: true },
    },
    {
      $group: {
        _id: '$brandId',
        count: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: 'brands',
        localField: '_id',
        foreignField: '_id',
        as: 'brand',
      },
    },
    { $unwind: '$brand' },
    {
      $project: {
        _id: 0,
        id: { $toString: '$_id' },
        name: '$brand.name',
        count: 1,
      },
    },
    { $sort: { count: -1 } },
  ];

  const brands = await Product.aggregate(brandsPipeline);

  const pricePipeline: PipelineStage[] = [
    {
      $match: { isActive: true, isPublished: true },
    },
    {
      $group: {
        _id: null,
        min: { $min: '$displayPrice' },
        max: { $max: '$displayPrice' },
      },
    },
  ];

  const priceResult = await Product.aggregate(pricePipeline);

  const priceRange: IPriceRange =
    priceResult.length > 0
      ? { min: priceResult[0].min, max: priceResult[0].max }
      : { min: 0, max: 0 };

  const now = new Date();

  const result: ISearchFilters = {
    filters: {
      brands: brands as IBrandFilter[],
      priceRange,
    },
    cachedAt: now.toISOString(),
  };

  setCache(cacheKey, result);
  return result;
};

export const invalidateFilterCache = (type: 'category' | 'search', identifier?: string): void => {
  if (type === 'search') {
    filterCache.delete(getCacheKey('search', 'global'));
  } else if (identifier) {
    filterCache.delete(getCacheKey('category', identifier));
  } else {
    for (const key of filterCache.keys()) {
      if (key.startsWith('category:')) {
        filterCache.delete(key);
      }
    }
  }
};