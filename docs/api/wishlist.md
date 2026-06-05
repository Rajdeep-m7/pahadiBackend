# Wishlist API Reference

**Base URL:** `/api/v1/wishlist`

**Authentication Required:** All routes require a valid Bearer token.

---

## Routes

### 1. Get Wishlist
Fetches all variants saved by the user. Populates specific fields (`title`, `price`, `mrp`, `coverImage`, `stocks`, `slug`).

- **Method:** `GET /`

### 2. Toggle Wishlist Item
Atomic "Like/Unlike" operation. If the item exists, it is removed; otherwise, it is added.

- **Method:** `PATCH /toggle/:variantId`
- **Response:** Returns the new state to allow instant UI updates.
```json
{
  "isSaved": true
}
```
- **Constraints:** Max 50 items per wishlist for performance.
