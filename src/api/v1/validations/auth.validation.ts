import { z } from 'zod';

// ==========================================
// OTP SCHEMAS
// ==========================================

export const sendOtpLoginSchema = z.object({
  body: z
    .object({
      phone: z
        .string({ message: 'Phone number is required' })
        .min(10, 'Phone number must be at least 10 characters'),
    })
    .strict(),
});

export const verifyOtpLoginSchema = z.object({
  body: z
    .object({
      phone: z
        .string({ message: 'Phone number is required' })
        .min(10, 'Phone number must be at least 10 characters'),
      otp: z.string({ message: 'OTP is required' }).length(6, 'OTP must be exactly 6 characters'),
      deviceInfo: z.string().optional(),
    })
    .strict(),
});

export const sendOtpMobileChangeSchema = z.object({
  body: z
    .object({
      newPhone: z
        .string({ message: 'New phone number is required' })
        .min(10, 'Phone number must be at least 10 characters'),
    })
    .strict(),
});

export const verifyOtpMobileChangeSchema = z.object({
  body: z
    .object({
      newPhone: z
        .string({ message: 'New phone number is required' })
        .min(10, 'Phone number must be at least 10 characters'),
      otp: z.string({ message: 'OTP is required' }).length(6, 'OTP must be exactly 6 characters'),
    })
    .strict(),
});

// ==========================================
// LOGIN WITH PASSWORD SCHEMA
// ==========================================
export const loginWithPasswordSchema = z.object({
  body: z.object({
    phone: z
      .string({ message: 'Phone number is required' })
      .min(10, 'Phone number must be at least 10 characters'),
    password: z
      .string({ message: 'Password is required' })
      .min(6, 'Password must be at least 6 characters'),
    deviceInfo: z.string().optional(),
  }),
});

// ==========================================
// REFRESH TOKEN SCHEMA
// ==========================================
export const refreshTokenSchema = z.object({
  body: z.object({
    // Optional because web clients send this via httpOnly cookies
    refreshToken: z.string().optional(),
    tokenType: z.enum(['admin', 'customer']),
    deviceInfo: z.string().optional(),
  }),
});

// ==========================================
// LOGOUT SCHEMA
// ==========================================
export const logoutSchema = z.object({
  body: z.object({
    // Optional because web clients send this via httpOnly cookies
    refreshToken: z.string().optional(),
  }).optional(),
});

// ==========================================
// REVOKE SINGLE SESSION SCHEMA
// ==========================================
export const revokeSingleSessionSchema = z.object({
  params: z.object({
    sessionId: z
      .string({ message: 'Session ID is required in URL' })
      .regex(/^[0-9a-fA-F]{24}$/, 'Invalid Session ID format'), // Validates MongoDB ObjectId
  }),
});

// ==========================================
// ADMIN LOGOUT USER SCHEMA
// ==========================================
export const adminLogoutUserSchema = z.object({
  params: z.object({
    id: z
      .string({ message: 'User ID is required in URL' })
      .regex(/^[0-9a-fA-F]{24}$/, 'Invalid User ID format'),
  }),
});
