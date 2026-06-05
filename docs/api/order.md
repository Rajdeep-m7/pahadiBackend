# Order API Reference

**Base URL:** `/api/v1/orders`

**Authentication Required:** All routes require a valid Bearer token.

---

## Customer Routes (Self-Management)

### 0. Create Order
The first step of the checkout flow. Converts items into an Order.

- **Method:** `POST /`
- **Body:**
```json
{
  "items": [
    {
      "variantId": "60d5ecb8b392d40015f8e6a1",
      "quantity": 1
    }
  ],
  "shippingAddress": {
    "fullName": "John Doe",
    "phone": "9876543210",
    "addressLine1": "123, Luxury Apartments",
    "addressLine2": "Road No. 4",
    "city": "Mumbai",
    "state": "Maharashtra",
    "postalCode": "400001",
    "country": "India"
  },
  "appliedCoupon": "WELCOME10",
  "isCartCheckout": false
}
```
- **Note:** If `isCartCheckout` is `true`, the entire cart will be cleared. If `false` (default for "Buy Now"), only the ordered items will be synced/removed from the cart.

### 1. Get My Orders
Fetches a paginated list of orders for the currently authenticated user.

- **Method:** `GET /me`
- **Query Parameters:**
  - `page` (number, default: 1)
  - `limit` (number, default: 10)
  - `status` (string: `pending_payment` | `processing` | `shipped` | `delivered` | `cancelled` | `returned`)

### 2. Get Order By ID
Fetches full details of a single order belonging to the user.

- **Method:** `GET /me/:id`

### 3. Cancel Order
Allows a customer to cancel an order if it is still in `pending_payment` or `processing` state.

- **Method:** `PATCH /me/:id/cancel`
- **Body:**
```json
  {
    "reason": "Changed my mind"
  }
```

---

## Admin / Staff Routes

### 4. Get All Orders
Returns a paginated and filterable list of all orders in the system.

- **Method:** `GET /`
- **Query Parameters:**
  - `page` (number, default: 1)
  - `limit` (number, default: 10)
  - `status` (string)
  - `startDate` (ISO Date)
  - `endDate` (ISO Date)
  - `search` (string: matches Order ID or Tracking Number)
  - `isConfirmed` (boolean string: `true` | `false`)

### 5. Trigger Shiprocket Dispatch (Multi-Warehouse)
Groups order items by warehouse and generates unique Shiprocket shipments for each.

- **Method:** `PATCH /:id/dispatch`
- **Note:** This will transition the order status to `shipped` and populate the `shipments` array.

### 6. Update Order Status
Manually transitions the order status through the state machine.

- **Method:** `PATCH /:id/status`
- **Body:**
```json
  {
    "orderStatus": "delivered",
    "comment": "Delivered to neighbor"
  }
```

### 7. Confirm Suspicious Order
Marks a flagged or unconfirmed order as verified.

- **Method:** `PATCH /:id/confirm`

