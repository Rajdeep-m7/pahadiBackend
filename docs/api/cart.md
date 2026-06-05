# Cart API Reference

**Base URL:** `/api/v1/cart`

**Authentication Required:** All routes require a valid Bearer token.

---

## Routes

### 1. Get Cart
Fetches the current user's cart. The API automatically populates essential variant details (`title`, `price`, `mrp`, `coverImage`, `stocks`, `slug`) to ensure the UI shows real-time data.

- **Method:** `GET /`
- **Response:**
```json
{
  "items": [
    {
      "variantId": {
        "title": "Variant Title",
        "price": 1000,
        "mrp": 1200,
        "coverImage": { "url": "..." },
        "stocks": 10,
        "slug": "..."
      },
      "quantity": 2
    }
  ]
}
```

### 2. Sync Cart (Hybrid Sync Strategy)
The workhorse for cart persistence. Accepts the entire cart array from the frontend. Used during login, checkout, or via debounced background workers.

- **Method:** `PUT /sync`
- **Body:**
```json
{
  "items": [
    { "variantId": "objectId", "quantity": 1 }
  ]
}
```
- **Constraints:**
  - Max 20 unique items per cart.
  - Max 10 quantity per item.

### 3. Clear Cart
Removes all items from the cart. Typically called after a successful order payment.

- **Method:** `DELETE /`
