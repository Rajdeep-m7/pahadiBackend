# Product API Reference

**Base URL:** `/api/v1/products`

---

## Public Routes

### 1. Get All Products
Returns a paginated and filterable list of products.

- **Method:** `GET /`
- **Query Parameters:**
  - `page` (number, default: 1)
  - `limit` (number, default: 10)
  - `search` (string)
  - `categoryId` (ObjectId)
  - `brandId` (ObjectId)

### 2. Get Product By ID
Fetches full details of a single product.

- **Method:** `GET /:id`

### 3. Get Similar Products
Fetches products from the same category.

- **Method:** `GET /:id/similar`

---

## Management Routes (Admin / Staff Only)

### 4. Create Product
Creates a new product with images. Uses `multipart/form-data`.

- **Method:** `POST /`
- **Body:** `FormData` containing `title`, `desc`, `specs`, `brandId`, `categoryId`, `pickupWareHouseId`, `returnPolicyType`, `returnWindowDays`, `isTaxInclude` (default true), `taxes` (array of objects), and `coverImage` (optional file).

### 5. Update Product
Updates product details and handles image additions/removals.

- **Method:** `PATCH /:id`
- **Body:** `FormData` containing fields to update and `removedImagesPublicIds` (JSON string array) for images to delete from Cloudinary.

### 6. Delete Product (Admin Only)
Hard-deletes a product and all its variants.

- **Method:** `DELETE /:id`

### 7. Get Variants By Product
Fetches all variants associated with a specific product.

- **Method:** `GET /:productId/variants`
