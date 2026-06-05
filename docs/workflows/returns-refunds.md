# Returns & Replacements Management Workflow

This document outlines the standard operating procedure for handling item returns and replacements, ensuring fraud prevention and customer satisfaction.

## 1. The Customer Request (Frontend)
When a user clicks "Request Return" on an item inside their Order Details page:

1. **RMA Modal:** Collects the type (Return or Replace) and a standardized reason (e.g., "Damaged", "Wrong Item").
2. **Visual Proof:** Integrate a Cloudinary upload widget. **Proof of damage/incorrect item is mandatory.**
3. **Submission:** Data is sent to the backend, and the item status updates to "Return Pending Approval".

---

## 2. The Approval & Logistics Phase (Admin)
The admin reviews the uploaded photos and reason.

- **Action:** Admin clicks "Approve Request".
- **Logistics Selection:**
  - **Option A: Shiprocket Reverse Pickup (Recommended):** Backend triggers the Shiprocket API to generate a Reverse AWB and schedule the driver.
  - **Option B: Manual / Customer Self-Ship:** Admin provides instructions and later updates the tracking number manually.
- **Status Update:** Order/Item moves to `pickup_scheduled`.

---

## 3. The Physical Inspection
Once the item is in transit, the money remains locked. No "Refund" or "Replace" buttons are available in the UI.

1. **Warehouse Arrival:** The item arrives at the warehouse.
2. **Inspection:** Staff physically opens the package and verifies the contents against the claim.
3. **Receipt Confirmation:** Admin clicks **"Mark Item as Received & Inspected"**.
4. **Status Update:** Status changes to `item_received`.

---

## 4. The Final Resolution
Only after the item is marked as received do the resolution buttons unlock.

### Scenario A: The customer requested a "Return"
- **Refund Initiation:** Admin clicks "Issue Refund".
- **Refund Logic:** The system calculates a **Partial Refund** using the specific item's subtotal. It does NOT refund the entire order.
- **Refund Methods:**
  - **Original Payment (Razorpay):** Automatically triggers the `rzp.payments.refund` function.
  - **Manual Refund:** Fields provided to record NEFT/UPI reference numbers.
- **Inventory Math:** The system **increments** stock for the variant as the item is returned to the shelf.

### Scenario B: The customer requested a "Replace"
- **Replacement Dispatch:** Admin clicks "Dispatch Replacement".
- **Fulfillment:** 
  - **Inventory Math:** The system **decrements** stock for the new variant being sent.
  - **Dispatch:** Admin can trigger a new Forward Shiprocket AWB.
- **Status Update:** Item status changes to `replaced`.

---

## ⚙️ Engineering Details

### Item-Level Status Tracking
Because orders can have multiple items (e.g., a shirt and a pair of shoes), we track the status of individual items inside the `order.items` array. One item can be `returned` while the rest of the order remains `active`.

### Inventory Integrity
- **Returns:** Stock is only restocked *after* physical inspection and refund processing.
- **Replacements:** Stock for the *new* item is checked and reserved during the final resolution step to ensure availability.

---

## 🛡️ Fraud Prevention Design
- **Human Verification:** No automated refunds. A human must touch the returned item before any money is moved.
- **UI Locking:** Resolution buttons are hidden until the physical inspection is confirmed (`item_received`), preventing accidental early refunds.
