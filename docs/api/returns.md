# Return & Replace API Reference

**Base URL:** `/api/v1/returns`

**Authentication Required:** All routes require a valid Bearer token.

---

## Customer Routes

### 1. Create Return Request
Handles the initial submission of a return or replacement request. Customers must provide visual proof of damage or the issue.

- **Method:** `POST /`
- **Body:**
```json
{
  "orderId": "ObjectId",
  "itemId": "ObjectId",
  "type": "return | replace",
  "reason": "String (min 5 chars)",
  "customerComment": "String (optional)",
  "imagesArray": [
    { "url": "String", "publicId": "String" }
  ],
  "pickupAddress": {
    "fullName": "String",
    "phone": "String",
    "addressLine1": "String",
    "city": "String",
    "state": "String",
    "postalCode": "String"
  }
}
```

---

## Admin / Staff Routes

### 2. Get All Return Requests
Paginated list of all RMA requests for the moderation dashboard.

- **Method:** `GET /`
- **Query Parameters:**
  - `page` (number, default: 1)
  - `limit` (number, default: 10)
  - `status` (string: `requested` | `approved` | `rejected` | `pickup_scheduled` | `item_received` | `resolved`)

### 3. Approve Return Request
Triggers the logistics phase. If `shiprocket` is chosen, it automatically generates a Reverse AWB.

- **Method:** `PATCH /:id/approve`
- **Body:**
```json
{
  "logisticsMethod": "shiprocket | manual",
  "adminNotes": "String (optional)"
}
```

### 4. Reject Return Request
Rejects the claim and reverts the item status in the original order to `active`.

- **Method:** `PATCH /:id/reject`
- **Body:**
```json
{
  "reason": "String (min 5 chars)"
}
```

### 5. Mark Item Received
Confirms that the item has physically arrived at the warehouse. This step **unlocks** the final resolution.

- **Method:** `PATCH /:id/received`
- **Body:**
```json
{
  "adminNotes": "String (optional)"
}
```

### 6. Resolve Return (Final Step)
Triggers the financial or inventory resolution.
- **Scenario Return:** Triggers a Razorpay refund (or records manual refund) and restocks the item.
- **Scenario Replace:** Decrements inventory for the replacement item and updates status.

- **Method:** `PATCH /:id/resolve`
- **Body:**
```json
{
  "refundMethod": "razorpay | manual",
  "manualReference": "String (UTR number, only if manual)"
}
```
