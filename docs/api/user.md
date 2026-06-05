# User Management API Reference

**Base URL:** `/api/v1/users`

**Authentication Required:** All routes in this file require a valid Bearer `accessToken` in the `Authorization` header.

---

## Current User Routes (Self-Management)

### 1. Get My Profile
Fetches the profile details of the currently authenticated user.

- **Method:** `GET /me`
- **Response:** Returns the full user object (excluding the password hash).

### 2. Update My Profile
Used primarily by customers to complete their profile (Progressive Onboarding). Strictly ignores phone, role, and password fields to prevent unauthorized privilege escalation.

- **Method:** `PATCH /me`
- **Body:**
```json
  {
    "name": "John Doe",
    "email": "john@example.com"
  }
```

---

## Management Routes (Admin / Staff Only)

### 3. Create Staff / Admin (Admin Only)
Creates a new privileged user.

- **Method:** `POST /staff`
- **Body:**
```json
  {
    "phone": "9876543211",
    "name": "New Staff Member",
    "email": "staff@example.com",
    "role": "staff",
    "password": "password123"
  }
```

### 4. Get All Users
Returns a paginated and filterable list of users.

- **Method:** `GET /`
- **Query Parameters:**
  - `page` (number, default: 1)
  - `limit` (number, default: 10)
  - `role` (string: `customer` | `staff` | `admin`)
  - `isActive` (boolean: `true` | `false`)
  - `search` (string: matches name or phone)

### 5. Get All Customers
Returns a specialized list of customers with order statistics and location data.

- **Method:** `GET /customers`
- **Query Parameters:**
  - `page` (number, default: 1)
  - `limit` (number, default: 10)
  - `search` (string: matches name or phone)
  - `location` (string: matches city or state. Use "All Locations" or empty to skip)
  - `fromDate` (date string: registration date from)
  - `toDate` (date string: registration date to)
  - `sortBy` (`newest` | `oldest` | `name_asc` | `name_desc`)
- **Response Fields:**
  - `name`: Customer name (fallback: 'Customer')
  - `phone`: Customer phone number
  - `isActive`: Boolean status
  - `createdAt`: Registration date
  - `totalOrders`: Count of all orders
  - `totalSpend`: Sum of all order amounts
  - `location`: Concat string of "City, State"

### 6. Get User By ID

- **Method:** `GET /:id`

### 6. Update User
Updates any user's details. If upgrading a `customer` to `staff` or `admin`, a `password` must be provided in the body.

- **Method:** `PATCH /:id`
- **Body:**
```json
  {
    "name": "Updated Name",
    "role": "admin",
    "password": "newpassword123"
  }
```
- **Response Note:** The API returns `{ user: {...}, isPasswordChanged: true }` if a new password was provided and hashed. Frontend should use this flag to prompt an immediate forced logout.

### 7. Toggle User Status
Disables or enables an account. Disabling a user automatically destroys all of their active sessions globally.

- **Method:** `PATCH /:id/toggle-status`

### 8. Admin: Force Logout Target User
Immediately destroys all refresh tokens and stamps the global kill-switch (`tokensRevokedAt`) for a specific user, invalidating any active Access Tokens instantly.

- **Method:** `POST /:id/logout-all`
- **Response:** `200 OK`

### 9. Delete User (Admin Only)
Hard-deletes the user from the database and clears all associated active sessions.

- **Method:** `DELETE /:id`