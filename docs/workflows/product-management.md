# Product & Variant Management Workflow

## 1. Catalog Hierarchy
- **Product:** The base entity (e.g., "Apple iPhone 15"). Holds category, brand, and general description.
- **Variant:** The sellable entity (e.g., "iPhone 15 - Black - 128GB"). Holds SKU, Price, MRP, and Stocks.

## 2. Deletion Safety & Ref Integrity
When performing deletions or status toggles, the system maintains strict referential integrity.

### Variant Toggling
- If a variant is disabled via `PATCH /api/v1/variants/:id/toggle`, it remains in the database but will be filtered out from search results and customer views.
- **Frontend Note:** If a user has a disabled variant in their cart, the `getCart` population will return `null` for that item. The frontend should detect this and display an "Out of Stock" or "Unavailable" badge.

### Hard Deletion (Admin Only)
- **Product Deletion:** Deleting a product automatically cascades and deletes all associated variants.
- **Variant Deletion:** Before deleting a variant, the system (or frontend) should ideally check if it's linked to active orders. 
- **User Confirmation:** If a variant is part of an active order, the backend should reject the deletion, and the frontend should show a modal: *"This variant is linked to existing orders. Please disable it instead of deleting."*

## 3. Real-time Price Validation
Because users may keep items in their cart for days, the frontend **MUST** treat the cart state as stale.
1. Every time the user opens the Cart page, the frontend calls `GET /api/v1/cart`.
2. The backend populates the latest `price` and `mrp` from the `Variant` model.
3. The frontend must overwrite the local prices with these fresh backend values before calculating the subtotal.
