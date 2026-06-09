import { Router } from 'express';
import {
  sendOtpLogin,
  sendOtpMobileChange,
  verifyOtpLogin,
  verifyOtpMobileChange,
  sendOtpDeleteAccount,
  verifyOtpDeleteAccount,
  loginWithPassword,
  refreshToken,
  logout,
  logoutAllDevices,
  getActiveSessions,
  revokeSingleSession,
  adminLogoutTargetUser,
} from '@/api/v1/controllers/auth.controller';
import { validateRequest } from '@/api/v1/middlewares/validateRequest.middleware';
import { protect, restrictTo } from '@/api/v1/middlewares/auth.middleware';
import {
  sendOtpLoginSchema,
  sendOtpMobileChangeSchema,
  verifyOtpLoginSchema,
  verifyOtpMobileChangeSchema,
  verifyOtpDeleteAccountSchema,
  loginWithPasswordSchema,
  refreshTokenSchema,
  logoutSchema,
  revokeSingleSessionSchema,
  adminLogoutUserSchema,
} from '@/api/v1/validations/auth.validation';

const router = Router();

// ==========================================
// PUBLIC ROUTES
// ==========================================

// OTP Flow (Customers)
router.post('/login/send-otp', validateRequest(sendOtpLoginSchema), sendOtpLogin);
router.post('/login/verify', validateRequest(verifyOtpLoginSchema), verifyOtpLogin);

// Password Flow (Staff/Admin)
router.post('/login-password', validateRequest(loginWithPasswordSchema), loginWithPassword);

// Token Management
// (Must be public so users can refresh/logout even if their access token is expired)
router.post('/refresh-token', validateRequest(refreshTokenSchema), refreshToken);
router.post('/logout', validateRequest(logoutSchema), logout);

// ==========================================
// PROTECTED ROUTES
// ==========================================
router.use(protect);

// Mobile Change Flow
router.post(
  '/mobile-change/send-otp',
  validateRequest(sendOtpMobileChangeSchema),
  sendOtpMobileChange
);
router.post(
  '/mobile-change/verify',
  validateRequest(verifyOtpMobileChangeSchema),
  verifyOtpMobileChange
);

// Account Deletion Flow
router.post('/delete-account/send-otp', sendOtpDeleteAccount);
router.post(
  '/delete-account/verify',
  validateRequest(verifyOtpDeleteAccountSchema),
  verifyOtpDeleteAccount
);

// Session Management
router.get('/sessions', getActiveSessions);
router.post('/logout-all', logoutAllDevices);
router.delete(
  '/sessions/:sessionId',
  validateRequest(revokeSingleSessionSchema),
  revokeSingleSession
);

// ==========================================
// ADMIN / STAFF ROUTES
// ==========================================

router.post(
  '/:id/logout-all',
  restrictTo('admin'),
  validateRequest(adminLogoutUserSchema),
  adminLogoutTargetUser
);

export default router;
