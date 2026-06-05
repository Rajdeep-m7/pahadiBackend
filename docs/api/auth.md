# Auth API Reference

**Base URL:** `/api/v1/auth`

**Client Type Header:**
Mobile applications MUST send the header `x-client-type: mobile` on all requests. Web applications (Next.js/React) should omit this header to utilize `httpOnly` secure cookies.

---

## Public Routes

### 1. Send OTP (Login)
Generates and sends a 6-digit OTP via WhatsApp for login/signup.

- **Method:** `POST /login/send-otp`
- **Body:**
```json
  {
    "phone": "1234567890"
  }
```

### 2. Verify OTP & Login
Verifies OTP and logs the customer in. Auto-creates a customer account if one does not exist.

- **Method:** `POST /login/verify`
- **Body:**
```json
  {
    "phone": "1234567890",
    "otp": "123456",
    "deviceInfo": "Postman Desktop"
  }
```
- **Response:** Returns `isNewUser: true` if the account was just created. Web clients receive `accessToken` and a `customerRefreshToken` cookie; Mobile receives `accessToken` and `refreshToken` in the JSON body.

---

## Protected Routes (Requires Bearer Token)

### 3. Send OTP (Mobile Change)
Sends an OTP to the NEW phone number that the user wants to switch to.

- **Method:** `POST /mobile-change/send-otp`
- **Body:**
```json
  {
    "newPhone": "9876543210"
  }
```

### 4. Verify OTP (Mobile Change)
Verifies the OTP sent to the new number and updates the user's phone record.

- **Method:** `POST /mobile-change/verify`
- **Body:**
```json
  {
    "newPhone": "9876543210",
    "otp": "123456"
  }
```

### 5. Get Active Sessions
Lists all active devices for the current logged-in user.

- **Method:** `GET /sessions`

### 6. Revoke Single Session
Logs the current user out of a specific device.

- **Method:** `DELETE /sessions/:sessionId`

### 7. Logout All Devices
Logs the current user out of everywhere and triggers the global kill switch.

- **Method:** `POST /logout-all`

### 8. Admin: Force Logout Target User (Admin/Staff Only)
Immediately kills all sessions and triggers the kill-switch for a specific user.

- **Method:** `POST /:id/logout-all`

---

## Shared Routes (Public for Token Refresh/Logout)

### 9. Login with Password (Staff/Admin Only)
Standard login for privileged accounts.

- **Method:** `POST /login-password`
- **Body:**
```json
  {
    "phone": "9876543210",
    "password": "password123",
    "deviceInfo": "Chrome - Windows"
  }
```

### 10. Refresh Token
Refreshes the short-lived access token.

- **Method:** `POST /refresh-token`
- **Body (Mobile Only):**
```json
  {
    "refreshToken": "string",
    "deviceInfo": "string"
  }
```

### 11. Logout (Current Device)
Logs the user out of the current device.

- **Method:** `POST /logout`
- **Body (Mobile Only):**
```json
  {
    "refreshToken": "string"
  }
```