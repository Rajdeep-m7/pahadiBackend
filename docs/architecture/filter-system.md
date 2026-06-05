# Category-Level Filter Config with Cached Aggregation

## Problem Statement

The product listing endpoint (`GET /products/category/:slug`) currently has hardcoded filters. We need dynamic, category-specific filters (brands, price range, variant attributes like RAM/Color/Storage) that come from actual data without over-engineering or excessive server cost.

---

## Design Decisions

### 1. Two Filter Modes

| Mode | Endpoint | Filters Available |
|------|----------|------------------|
| **Category Page** | `/products/category/:slug/filters` | Full: brands + price range + attribute filters |
| **Search Page** | `/products/search/filters` | Universal only: brands + price range |

Rationale: Search spans all categories so attribute filters (RAM, Color) don't apply. Category pages have specific product types where attributes make sense.

### 2. Cache Strategy: TTL-based In-Memory Cache with FIFO Eviction

- **No Redis dependency** - use Node.js in-memory `Map` with TTL
- **TTL: 15 minutes** - for low-scale ecommerce, freshness acceptable
- **FIFO eviction** - when cache exceeds 50 entries, oldest entries are removed
- **Lazy recomputation** - compute on first request after cache miss, not on every write
- **Eventual consistency acceptable** - filter options can be ~15 minutes stale

**Auto-Discovery:** When `category.filterConfig.attributeFilters` is empty/not configured, the system auto-discovers attribute keys from existing variants. Invalid/system keys (discount, stock, etc.) and long keys (>30 chars) are filtered out.

Rationale: Simple, zero infrastructure, handles load well. FIFO prevents unbounded memory growth. Writes don't trigger cache invalidation overhead.

### 3. Filter Configuration Storage

Add fields to **Category model** to store filter configuration:

```typescript
// Category model - new fields
{
  filterConfig: {
    enabled: boolean,              // is filtering enabled for this category
    attributeFilters: [            // which attribute keys to show as filters
      { key: string, label: string, displayOrder: number }
    ],
    excludeFromSearch: boolean     // hide from search page filters
  }
}
```

### 4. Filter Options Response Shape

```typescript
// GET /products/category/:slug/filters
{
  category: { id, name, slug },
  filters: {
    brands: [
      { id, name, count }  // count = products in this category
    ],
    priceRange: {
      min: number,         // lowest variant price
      max: number          // highest variant price
    },
    attributes?: [        // only if filterConfig.enabled && attributeFilters.length > 0
      {
        label: "RAM",      // attribute key used as label
        values: [
          { value: "8GB", count },  // count = variants with this value
          { value: "16GB", count }
        ]
      }
    ]
  },
  subcategories: [         // children of current category (max 2 levels deep)
    {
      id: string,
      name: string,
      slug: string,
      productCount: number,  // published, active products in this subcategory
      children?: [           // grandchildren (Level 2)
        { id, name, slug, productCount }
      ]
    }
  ],
  cachedAt: ISO8601,
  expiresAt: ISO8601
}
```

```typescript
// GET /products/search/filters
{
  filters: {
    brands: [...],
    priceRange: { min, max }
  },
  cachedAt: ISO8601
}
```

### 5. Category Filter Configuration

Each category can have a `filterConfig` to control which attribute filters are shown:

```typescript
// Category model - filterConfig field
{
  filterConfig: {
    enabled: boolean,              // is filtering enabled for this category
    attributeFilters: [            // which attribute keys to show as filters
      { key: string, label: string, displayOrder: number }
    ],
    excludeFromSearch: boolean     // hide from search page filters (future use)
  }
}
```

**Example:** For a "Smartphones" category, admin might configure:
```json
{
  "filterConfig": {
    "enabled": true,
    "attributeFilters": [
      { "key": "RAM", "label": "RAM", "displayOrder": 1 },
      { "key": "Storage", "label": "Storage", "displayOrder": 2 },
      { "key": "Color", "label": "Color", "displayOrder": 3 }
    ]
  }
}
```

---

## Data Flow

### On Request (Cache Hit)
1. Check in-memory cache for key `filters:{categoryId}`
2. If exists and not expired → return cached data
3. If miss → compute aggregations → store in cache → return

### Aggregations Required

**Brands:**
```javascript
Product.aggregate([
  { $match: { categoryId: { $in: categoryIds }, isActive: true, isPublished: true } },
  { $group: { _id: '$brandId', count: { $sum: 1 } } },
  { $lookup: { from: 'brands', localField: '_id', foreignField: '_id', as: 'brand' } },
  { $unwind: '$brand' },
  { $project: { id: '$_id', name: '$brand.name', count: 1 } }
])
```

**Price Range:**
```javascript
Product.aggregate([
  { $match: { categoryId: { $in: categoryIds } } },
  { $group: { _id: null, min: { $min: '$displayPrice' }, max: { $max: '$displayPrice' } } }
])
```

**Attribute Filters:**
```javascript
Variant.aggregate([
  { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
  { $unwind: '$product' },
  { $match: { 'product.categoryId': { $in: categoryIds }, 'product.isPublished': true, 'product.isActive': true, isActive: true } },
  { $group: { _id: '$attributes', count: { $sum: 1 } } }
])
// Post-process to extract unique attribute keys and their values from filterConfig
```

**Subcategories:**
```javascript
// Step 1: Get direct children (Level 1)
Category.find({ parentCategoryId: { $in: categoryIds } })

// Step 2: Get product counts per child category
Product.aggregate([
  { $match: { categoryId: { $in: childIds }, isActive: true, isPublished: true } },
  { $group: { _id: '$categoryId', count: { $sum: 1 } } }
])

// Step 3: Get grandchildren (Level 2) - repeated for each child with children
Category.find({ parentCategoryId: child._id })
```

---

## File Structure

```
src/api/v1/
├── controllers/
│   └── filters.controller.ts        # NEW - filter options endpoints
├── services/
│   └── filters.service.ts           # NEW - cache + aggregation logic
├── models/
│   └── category.model.ts           # MODIFY - add filterConfig
├── routes/
│   └── product.route.ts            # MODIFY - add filter routes
├── validations/
│   └── filters.validation.ts      # NEW - query param schemas
└── types/
    └── filters.types.ts            # NEW - TypeScript interfaces
```

---

## Implementation Steps

### Phase 1: Core Infrastructure ✅
1. ✅ Add `filterConfig` field to Category model
2. ✅ Create `filters.service.ts` with in-memory cache + TTL + FIFO eviction
3. ✅ Implement aggregation functions for brands, price, attributes
4. ✅ Create `filters.controller.ts` with two endpoints
5. ✅ Add routes to `product.route.ts`
6. ✅ Updated Postman collection with new endpoints
7. ✅ Auto-discover attribute keys from variants when filterConfig not configured

### Phase 2: Apply Filters to Product Listing ✅
8. ✅ Extend `/products/category/:slug` to accept filter params
9. ✅ Implement variant-to-product attribute filtering (OR within key, AND across keys)
10. ✅ Add subcategoryId filter support
11. ✅ Update validation schemas

### Phase 3: Refinement (Future)
12. Add API endpoint to update category filterConfig (admin only)
13. Consider adding filter to category CRUD response
14. Write-through cache invalidation when products/variants change

---

## Performance Considerations

- **FIFO Cache Limit:** Max 50 entries, oldest evicted first when limit reached
- **Cache Key Pattern:** `category:{slug}` for category filters, `search:global` for search filters
- **Category Tree:** `getDescendantIds` is called once and results are reused across aggregations
- **Parallel Aggregations:** Brands, price, and subcategories are fetched in parallel with `Promise.all`
- **Fallback:** If aggregation fails, returns empty filters (doesn't crash the page)

---

## Future Optimizations (if needed)

1. **Write-through invalidation:** Add cache invalidation when product/variant is created/updated (requires touching product/variant controllers)
2. **Redis cache:** If in-memory doesn't scale, migrate to Redis with persistent cache
3. **Precompute on schedule:** Cron job to precompute filters for top 20 categories nightly
4. **Search page optimization:** For search, could cache per query hash instead of global