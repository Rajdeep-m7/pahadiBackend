# Payment Integration & Financial Security

This guide focuses on the technical mechanics, security protocols, and administrative reconciliation of our Razorpay integration. While `order-lifecycle.md` covers the user journey, this document ensures financial integrity.

## 1. The Handshake (`initiatePayment`)
Purpose: Generates the Razorpay order ID and creates a pending transaction record.

- **Amount Logic:** Razorpay expects amounts in **Indian Paise**. We strictly use `Math.round(totalAmount * 100)` to prevent decimal rounding errors.
- **Idempotency:** The controller verifies that the Order is strictly in `pending_payment` status. This prevents duplicate transaction records if a user double-clicks the "Pay" button.

## 2. Webhook: The Source of Truth
The `razorpayWebhook` is the **only** automated mechanism that updates a transaction to `success`.

### 🛡️ Security: The Raw Buffer Trap
Signature verification will fail if Express parses the webhook into a JSON object before the check.
- **Implementation:** We use a custom verify function in `src/index.ts` to capture the `req.rawBody` buffer specifically for `/webhook` routes.
- **Cryptographic Check:** We use `crypto.createHmac('sha256', secret).update(rawBody).digest('hex')` to verify the `x-razorpay-signature` header.

### ⚡ Performance: Timeout Retries
Razorpay expects a fast `200 OK` response. 
- If the database update takes too long (>10s), Razorpay will assume failure and fire a second webhook. 
- Our controller uses an `isProcessed` lock (idempotency) to ensure that even if multiple webhooks arrive, the order and transaction are only updated once.

### 🚫 Trust Policy
**Never trust the frontend.** The frontend redirecting to `/success` is only for UX. The order status only moves to `processing` once the server-to-server webhook is verified.

## 3. Administrative Reconciliation
For the finance and support teams, the system acts as a master ledger.

- **Reconciliation:** Admin can filter `GET /api/v1/payments` by `status=success` to reconcile bank payouts.
- **Investigation:** In cases of "Orphaned Webhooks" (where a bank deducts money but fails to notify Razorpay instantly), admins use the `gatewayPaymentId` to manually verify status in the Razorpay Dashboard.
- **Refunds:** Triggered via the `approveReturn` flow in the Order Controller, which calls `triggerRazorpayRefund`. This ensures restocked items are linked to the refund event.

## 🚨 Critical Developer Gotchas
- **Missing Indexes:** We maintain indexes on `gatewayOrderId` and `paymentStatus` to prevent database crashes during high-volume transaction queries.
- **Data Bloat:** Financial list views use `.populate('userId', 'name email')` to keep payloads lightweight while providing essential contact info for support.
