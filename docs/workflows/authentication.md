# Authentication Workflow & Architecture

Our API automatically detects the client type to ensure maximum security for web, and maximum compatibility for mobile apps.

## 1. Storage Strategy
* **Web Frontend (Next.js/React):**
  * The API sends the `refreshToken` in an `httpOnly` cookie. This cookie is named `customerRefreshToken` for customers and `adminRefreshToken` for staff/admin. Both are immune to XSS.
  * The `accessToken` comes in the JSON response. Store the `accessToken` in memory (Zustand, Redux, Context). Do **not** store it in `localStorage`.
* **Mobile Frontend (React Native/Flutter):**
  * You **MUST** attach the header `x-client-type: mobile` to all auth requests.
  * The API sends both the `accessToken` and `refreshToken` in the JSON response. Store both in the device's native secure storage (SecureStore / Keychain).

## 2. Token Rotation (Axios Interceptor)
Access tokens expire every 15 minutes. The frontend must implement an interceptor to handle this seamlessly without disrupting the user experience:
1. Catch any `401 Unauthorized` error.
2. Pause the failed request.
3. Call `POST /api/v1/auth/refresh-token`. 
4. If successful, save the new `accessToken` and retry the original failed request.
5. If it fails (refresh token expired, stolen, or revoked), clear local state and redirect to the Login screen.

## 3. The Global Kill Switch
If an Admin forces a user out via `POST /api/v1/auth/:id/logout-all`, the backend stamps a `tokensRevokedAt` timestamp on the user's database record. 
Even if the user holds an Access Token that is still technically valid for another 10 minutes, the backend middleware will immediately reject it with a `401`, forcing the interceptor to fail and logging the user out instantly.

## 4. Admin Password Updates
If an admin updates a user's password via `PATCH /api/v1/users/:id`, the API returns `isPasswordChanged: true`. The frontend should immediately trigger a modal: *"Password updated. Do you want to log this user out of all active devices?"* If accepted, immediately call the forced logout route.