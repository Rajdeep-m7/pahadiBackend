# Order Lifecycle & Checkout Workflow

This guide outlines the end-to-end journey of an order, from the initial checkout to delivery and tracking.

## Phase 1: The Checkout & Payment Flow

Goal: Take the user from the Cart page to a successful payment without a single page reload or flicker.

### Step 1: The Review Page (`/checkout`)
- **Data Fetching:** Fetch the user's synced Cart.
- **UI Elements:** Display items, a form to select/add a `shippingAddress`, and an input for an `appliedCoupon`.
- **Local Math:** Calculate the estimated total locally for display purposes only. **The backend will recalculate it securely during the createOrder call.**

### Step 2: "Place Order" (The Double-Hop)
When the user clicks "Pay Now", show a full-screen loading spinner to prevent double-clicks.

1. **Hop 1 (Create Order):** Send the `items` array, `shippingAddress`, `appliedCoupon`, and optional `isCartCheckout` flag to `POST /api/v1/orders`.
   * *Result:* Backend creates the Order (status: `pending_payment`) and returns the `order._id`.
2. **Hop 2 (Initiate Payment):** Send that `order._id` to `POST /api/v1/payments/initiate`.
   * *Result:* Backend returns the Razorpay `gatewayOrderId` and the exact amount.

### Step 3: The Razorpay Modal
Inject the Razorpay SDK script dynamically and use the `gatewayOrderId` to open the payment window.

### Step 4: Verification (The Fallback)
Once the Razorpay modal closes successfully:
- **Frontend Action:** Call `POST /api/v1/payments/verify` with the `razorpay_order_id`, `razorpay_payment_id`, and `razorpay_signature`.
- **Backend Action:** Verifies the signature and updates the order to `processing` immediately.
- **Why?** This ensures the order is updated even if the Razorpay Webhook is delayed or the server was temporarily unreachable during the webhook callback.

---

## Phase 2: Order History (`/account/orders`)

- **Data Fetching:** Call `GET /api/v1/orders/me?page=1`. Use SWR/React Query for auto-refreshing after payment.
- **UI Layout:**
  - Use Tabs to filter: "All Orders", "Pending Payments", "Processing/Shipped", "Returns".
  - Show status badges (Yellow: Processing, Green: Delivered, Red: Cancelled).
- **"Retry Payment" Button:** For orders with `pending_payment` status, show a button that re-triggers the payment initiation flow.

---

## Phase 3: Order Details & Tracking (`/account/orders/[id]`)

- **The Timeline UI:** Map over the `statusHistory` array to render a vertical stepper component showing the journey of the package.
- **Multi-Shipment Tracking:** Since orders can be split across warehouses, iterate over the `shipments` array. For each shipment, display:
  - Tracking Number
  - Courier Provider
  - "Track on Courier Website" link (using `trackingUrl`).
- **Conditional Actions:**
  - `pending_payment` or `processing`: Show "Cancel Order" button.
  - `delivered`: Show "Request Return/Replacement" button.

---

## 🚨 Senior Developer "Gotchas"

### The Webhook Race Condition
Sometimes the user is redirected to `/checkout/success` before the Razorpay webhook has finished updating the backend.
- **The Trap:** Success page shows `pending_payment` because the backend hasn't received the callback yet.
- **The Fix:** Use polling (e.g., SWR `refreshInterval: 2000`) on the success page until `orderStatus` changes to `processing`.

### Stale Cart State
After checkout, the backend clears the cart, but the frontend global state (Zustand/Redux) might still show old items.
- **The Fix:** Explicitly dispatch an action to clear the local cart state immediately upon a successful payment response.
