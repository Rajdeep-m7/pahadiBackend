import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

// ==========================================
// UPDATE ME SCHEMA (Self Profile)
// ==========================================
export const updateMeSchema = z.object({
  body: z
    .object({
      name: z.string().min(3, 'Name must be at least 3 characters').optional(),
      email: z.email('Invalid email format').optional(),
    })
    .strict(),
});

// ==========================================
// CREATE STAFF / ADMIN SCHEMA
// ==========================================
export const createStaffSchema = z.object({
  body: z.object({
    phone: z.string().min(10, 'Phone number is required'),
    name: z.string().min(3, 'Name must be at least 3 characters'),
    email: z.email('Invalid email format').optional(),
    role: z.enum(['admin', 'staff'], {
      message: "Role must be 'admin' or 'staff'",
    }),
    password: z.string().min(6, 'Password must be at least 6 characters'),
  }),
});

// ==========================================
// UPDATE USER SCHEMA (Admin / Staff)
// ==========================================
export const updateUserSchema = z.object({
  params: z.object({
    id: z.string({ message: 'User ID is required' }).regex(objectIdRegex, 'Invalid User ID format'),
  }),
  body: z
    .object({
      phone: z.string().min(10).optional(),
      name: z.string().min(3).optional(),
      email: z.email().optional(),
      role: z.enum(['admin', 'staff', 'customer']).optional(),
      password: z.string().min(6).optional(),
    })
    .strict(),
});

// ==========================================
// GENERIC ID PARAM SCHEMA
// ==========================================
// Reusable for getUserById, toggleStatus, deleteUser, and logoutTargetUser
export const userIdParamSchema = z.object({
  params: z.object({
    id: z.string({ message: 'User ID is required' }).regex(objectIdRegex, 'Invalid User ID format'),
  }),
});

// ==========================================
// GET ALL CUSTOMERS SCHEMA (Admin / Staff)
// ==========================================
export const getAllCustomersSchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    search: z.string().optional(),
    location: z.string().optional(),
    fromDate: z.string().optional(),
    toDate: z.string().optional(),
    sortBy: z.enum(['newest', 'oldest', 'name_asc', 'name_desc']).optional(),
  }),
});

// ==========================================
// GET ALL USERS SCHEMA
// ==========================================
export const getAllUsersSchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    role: z
      .string()
      .optional()
      .refine(
        (val) => {
          if (!val) return true;
          const roles = val.split(',').map((r) => r.trim());
          return roles.every((role) => ['admin', 'staff', 'customer'].includes(role));
        },
        {
          message: "Invalid role(s). Expected comma-separated list of: 'admin', 'staff', 'customer'",
        }
      ),
    isActive: z.enum(['true', 'false']).optional(),
    search: z.string().optional(),
  }),
});

// ==========================================
// GET USER BY ID SCHEMA
// ==========================================
export const getUserByIdSchema = userIdParamSchema;

// ==========================================
// TOGGLE STATUS SCHEMA
// ==========================================
export const toggleUserStatusSchema = userIdParamSchema;

// ==========================================
// DELETE USER SCHEMA
// ==========================================
export const deleteUserSchema = userIdParamSchema;
