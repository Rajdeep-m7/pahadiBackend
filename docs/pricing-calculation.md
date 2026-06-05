# Pricing Calculation Guide

## Overview

This document describes the complete pricing calculation flow used when creating an order, including how discounts (coupons) are applied and how taxes are calculated per item.

---

## Pricing Pipeline

```
Cart Items → Base Price → Coupon Discount → Tax Calculation → Item Total → Order Total
```

### Step 1: Base Price
Each item's base price is taken from `variant.price` at order time.

```
baseSubtotal = price × quantity
```

### Step 2: Coupon Discount (Discount Apportionment)

Two scenarios exist:

#### Scenario A: Percentage-Based Coupon (e.g., 9% off)

The same percentage is applied to **each item's price individually**.

```
discount_item = basePrice_item × (couponPercentage / 100)
```

**Example:** 9% coupon on 3 items with base price ₹100 each:
```
Item 1: discount = 100 × 0.09 = 9
Item 2: discount = 100 × 0.09 = 9
Item 3: discount = 100 × 0.09 = 9
Total coupon discount = 27
```

#### Scenario B: Flat Amount Coupon (e.g., ₹30 off total)

The fixed discount is **apportioned proportionally** based on each item's weight in the cart.

```
weight_item = (basePrice_item × quantity) / totalCartBase
discount_item = weight_item × totalCouponDiscount
```

**Example:** ₹30 flat discount on cart totaling ₹300 (3 items × ₹100):
```
Item 1: weight = 100/300, discount = (100/300) × 30 = 10
Item 2: weight = 100/300, discount = (100/300) × 30 = 10
Item 3: weight = 100/300, discount = (100/300) × 30 = 10
Total coupon discount = 30
```

#### Percentage Coupon with Cap

If a percentage coupon has a `maxDiscount` cap, the discount is capped:
```
discount = min(subtotal × (percentage / 100), maxDiscount)
```

---

### Step 3: Effective Price (Post-Discount)

```
effectivePrice = price - (discount_item / quantity)
effectiveSubtotal = baseSubtotal - discount_item
```

---

### Step 4: Tax Calculation

Tax is calculated on the **effective (post-discount) subtotal**, not the base subtotal.

Tax slabs come from the product's `effectiveTax` field, which is resolved as:
1. **Product's own taxes** if set (non-empty array)
2. **Category's effective tax** via tax inheritance chain
3. **null** if neither exists

Each tax slab is applied independently:

```
taxAmount_name = effectiveSubtotal × (slab / 100)
```

**Example:** CGST 9% + SGST 9% on effective subtotal ₹91:
```
CGST amount = 91 × 0.09 = 8.19
SGST amount = 91 × 0.09 = 8.19
Total tax = 16.38
```

---

### Step 5: Item Total (Final Line Item)

```
itemTotal = effectiveSubtotal + totalTax
```

---

### Step 6: Order-Level Totals

```
subtotal = sum of all base subtotals
couponDiscount = sum of all item-level discount apportioned
itemTax = sum of all item-level totalTax
shippingCost = (subtotal > 1000) ? 0 : 50
totalAmount = subtotal - couponDiscount + itemTax + shippingCost
```

---

## Complete Calculation Example

### Scenario A: 9% Percentage Coupon

**Cart:**
- Item 1: base price ₹100, tax: CGST 9% + SGST 9%
- Item 2: base price ₹100, tax: CGST 6% + SGST 6%
- Item 3: base price ₹100, tax: 0%

**Step 1 — Base:**
```
P1: baseSubtotal = 100
P2: baseSubtotal = 100
P3: baseSubtotal = 100
subtotal = 300
```

**Step 2 — Coupon (9% off each item):**
```
P1: discount = 9
P2: discount = 9
P3: discount = 9
totalCouponDiscount = 27
```

**Step 3 — Effective Subtotal:**
```
P1: effectiveSubtotal = 100 - 9 = 91
P2: effectiveSubtotal = 100 - 9 = 91
P3: effectiveSubtotal = 100 - 9 = 91
```

**Step 4 — Tax (on effective):**
```
P1: CGST = 8.19, SGST = 8.19, totalTax = 16.38
P2: CGST = 5.46, SGST = 5.46, totalTax = 10.92
P3: totalTax = 0
itemTax = 27.30
```

**Step 5 — Item Total:**
```
P1: 91 + 16.38 = 107.38
P2: 91 + 10.92 = 101.92
P3: 91 + 0 = 91.00
```

**Step 6 — Order Total:**
```
subtotal = 300
couponDiscount = 27
itemTax = 27.30
shippingCost = 0 (subtotal > 1000)
totalAmount = 300 - 27 + 27.30 + 0 = 300.30
```

**Verification:** 300.30 = 330 × (1 - 0.09) ✓

---

### Scenario B: ₹30 Flat Coupon

**Cart:** Same items as above

**Step 1 — Base:** subtotal = 300

**Step 2 — Coupon (₹30 apportioned by weight):**
```
Since all items have same weight (100/300 each):
P1: discount = 10
P2: discount = 10
P3: discount = 10
totalCouponDiscount = 30
```

**Step 3 — Effective Subtotal:**
```
P1: effectiveSubtotal = 90
P2: effectiveSubtotal = 90
P3: effectiveSubtotal = 90
```

**Step 4 — Tax (on effective):**
```
P1: CGST = 8.10, SGST = 8.10, totalTax = 16.20
P2: CGST = 5.40, SGST = 5.40, totalTax = 10.80
P3: totalTax = 0
itemTax = 27.00
```

**Step 5 — Item Total:**
```
P1: 90 + 16.20 = 106.20
P2: 90 + 10.80 = 100.80
P3: 90 + 0 = 90.00
```

**Step 6 — Order Total:**
```
subtotal = 300
couponDiscount = 30
itemTax = 27.00
shippingCost = 0
totalAmount = 300 - 30 + 27.00 + 0 = 297.00
```

---

## Order Item Schema (New Fields)

Each order item now stores detailed pricing breakdown:

| Field | Description |
|-------|-------------|
| `price` | Base price per unit |
| `subtotal` | Base subtotal (price × quantity) |
| `discountApportioned` | Portion of coupon discount for this item |
| `effectivePrice` | Price after discount per unit |
| `effectiveSubtotal` | Subtotal after discount |
| `taxDetails` | Array of `{name, slab, amount}` per tax slab |
| `totalTax` | Sum of all tax amounts for this item |
| `itemTotal` | Final line total (effectiveSubtotal + totalTax) |

**Order-level fields:**

| Field | Description |
|-------|-------------|
| `subtotal` | Sum of all base subtotals |
| `couponDiscount` | Total coupon discount applied |
| `itemTax` | Sum of all item-level taxes |
| `shippingCost` | Shipping fee |
| `totalAmount` | Final amount (subtotal - discount + tax + shipping) |

---

## Frontend Usage

When displaying order details or checkout summary:

1. **Show base price** → `item.price`
2. **Show discount saved** → `item.discountApportioned`
3. **Show effective price** → `item.effectivePrice`
4. **Show tax breakdown** → `item.taxDetails` (CGST ₹X.XX, SGST ₹X.XX)
5. **Show total tax** → `item.totalTax`
6. **Show item total** → `item.itemTotal`

For the order summary:
```
Subtotal:        ₹300.00
Coupon Discount: -₹27.00
Tax:             +₹27.30
Shipping:        +₹0.00
─────────────────────────
Total:           ₹300.30
```

---

## Coupons API

### Create Coupon (Admin)
```
POST /coupons
Body: {
  code: "WELCOME10",
  type: "percentage",        // "percentage" | "flat"
  value: 10,                // 10% or ₹10 flat
  minOrderValue: 500,       // minimum cart value to apply
  maxDiscount: 200,         // cap for percentage coupons (0 = no cap)
  expiresAt: "2026-12-31",
  userLimit: 1              // max uses per user (0 = unlimited)
}
```

### Validate Coupon (Pre-Order)
```
GET /coupons/validate?code=WELCOME10&subtotal=1000
Response: {
  valid: true,
  coupon: {
    code: "WELCOME10",
    type: "percentage",
    value: 10,
    maxDiscount: 200
  },
  calculatedDiscount: 100
}
```

### List Coupons (Admin)
```
GET /coupons?page=1&limit=10
```

### Update Coupon (Admin)
```
PATCH /coupons/:id
Body: { isActive: false }
```

### Delete Coupon (Admin)
```
DELETE /coupons/:id
```