# Payment API Reference

**Base URL:** `/api/v1/payments`

**Authentication Required:** All routes except the webhook require a valid Bearer token.

---

## Public / System Routes

### 1. Razorpay Webhook
Silent listener for Razorpay payment events.

- **Method:** `POST /webhook`
- **Events Handled:**
  - `payment.captured`: Updates transaction to `success`, order to `processing`, and clears user cart.
  - `payment.failed`: Updates transaction to `failed` and logs the error in order history.

---

## Customer Routes

### 2. Initiate Payment
Creates a Razorpay gateway order and a local pending transaction record.

- **Method:** `POST /initiate`
- **Body:**
```json
  {
    "orderId": "60d5ecb8b392d40015f8e6a1"
  }
```
- **Response:**
```json
  {
    "gatewayOrderId": "order_xyz",
    "amount": 5000,
    "currency": "INR"
  }
```

### 3. Verify Payment
Synchronously verifies a payment using the signature provided by the Razorpay frontend SDK. This acts as a fallback for the webhook.

- **Method:** `POST /verify`
- **Body:**
```json
  {
    "razorpayOrderId": "order_xyz",
    "razorpayPaymentId": "pay_xyz",
    "razorpaySignature": "signature_xyz"
  }
```

---

## Admin Routes

### 4. Get All Transactions
Paginated list of all financial transactions.

- **Method:** `GET /`
- **Query Parameters:**
  - `page` (number, default: 1)
  - `limit` (number, default: 10)
  - `status` (string: `pending` | `success` | `failed` | `refunded`)
  - `search` (string: matches Gateway Order ID or Payment ID)

### 4. Get Transaction By ID

- **Method:** `GET /:id`
