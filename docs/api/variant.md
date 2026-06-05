# Variant API Reference

**Base URL:** `/api/v1/variants`

---

## Public Routes

### 1. Search Variants
Global search for variants across products.

- **Method:** `GET /search`
- **Query Parameters:**
  - `search` (string)
  - `page` (number)
  - `limit` (number)

### 2. Get Variant By ID
Fetches details for a specific variant. The parent product is hydrated with specifications, descriptions, brand name, and category name.

- **Method:** `GET /:id`

### 3. Get Variant By Slug
Fetches details for a specific variant using its slug. The parent product is hydrated with specifications, descriptions, brand name, and category name.

- **Method:** `GET /slug/:slug`

---

## Management Routes (Admin / Staff Only)

### 4. Create Variant
Adds a new variant to an existing product.

- **Method:** `POST /`
- **Body:** `FormData` containing `productId`, `title`, `sku`, `price`, `mrp`, `stocks`, `attributes` (JSON), and `coverImage` (file).

### 5. Update Variant
Updates price, stocks, or attributes of a variant.

- **Method:** `PATCH /:id`

### 6. Toggle Variant Status
Enables or disables a variant.

- **Method:** `PATCH /:id/toggle`

### 7. Delete Variant
Removes a variant permanently.

- **Method:** `DELETE /:id`
