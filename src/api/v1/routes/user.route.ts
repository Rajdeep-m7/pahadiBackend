import { Router } from 'express';
import {
  me,
  updateMe,
  createStaff,
  getAllUsers,
  getAllCustomers,
  getUserById,
  updateUser,
  toggleUserStatus,
  deleteUser,
} from '@/api/v1/controllers/user.controller';
import { validateRequest } from '@/api/v1/middlewares/validateRequest.middleware';
import { protect, restrictTo } from '@/api/v1/middlewares/auth.middleware';
import {
  updateMeSchema,
  createStaffSchema,
  updateUserSchema,
  getAllUsersSchema,
  getAllCustomersSchema,
  getUserByIdSchema,
  toggleUserStatusSchema,
  deleteUserSchema,
} from '@/api/v1/validations/user.validation';

const router = Router();

// ==========================================
// PROTECTED ROUTES (All authenticated users)
// ==========================================
router.use(protect);

router.get('/me', me);
router.patch('/me', validateRequest(updateMeSchema), updateMe);

// ==========================================
// STAFF / ADMIN ROUTES
// ==========================================
router.use(restrictTo('admin', 'staff'));

router.get('/', validateRequest(getAllUsersSchema), getAllUsers);
router.get('/customers', validateRequest(getAllCustomersSchema), getAllCustomers);
router.post('/staff', restrictTo('admin'), validateRequest(createStaffSchema), createStaff);
router.get('/:id', validateRequest(getUserByIdSchema), getUserById);
router.patch('/:id', validateRequest(updateUserSchema), updateUser);
router.patch('/:id/status', validateRequest(toggleUserStatusSchema), toggleUserStatus);
router.delete('/:id', restrictTo('admin'), validateRequest(deleteUserSchema), deleteUser);

export default router;
