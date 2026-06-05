# Progressive Authentication (Customer Onboarding)

To reduce friction during the initial booking/checkout process, we utilize a "Progressive Onboarding" strategy. Customers are not forced to fill out long forms to enter the system.

## The Flow
1. **Initiation:** The user enters their phone number on the login screen.
2. **OTP Request:** Frontend calls `POST /api/v1/auth/send-otp`.
3. **Verification:** The user receives a WhatsApp message and enters the 6-digit OTP.
4. **Login/Upsert:** Frontend calls `POST /api/v1/auth/verify-otp`.
   * The backend checks if the phone number exists.
   * If it exists, they are logged in.
   * If it does **not** exist, the backend seamlessly creates a new `customer` document with just the phone number.
5. **Profile Completion:** * The login response includes a boolean flag: `isNewUser`.
   * If `isNewUser === true`, the frontend must immediately present a "Complete Profile" modal to collect their `name` and `email`.
   * When submitted, the frontend calls `PATCH /api/v1/users/me` to save these details.