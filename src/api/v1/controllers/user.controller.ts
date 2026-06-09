import { Response, NextFunction } from 'express';
import mongoose, { PipelineStage } from 'mongoose';
import { User, IUserDocument } from '@/api/v1/models/user.model';
import { RefreshToken } from '@/api/v1/models/refreshToken.model';
import { httpError } from '@/api/v1/utils/httpError';
import httpResponse from '@/api/v1/utils/httpResponse';
import { AuthRequest } from '@/api/v1/interfaces/auth.interface';

// ==========================================
// HELPER: PREVENT SELF-MODIFICATION
// ==========================================
const preventSelfAction = (currentUser: IUserDocument, targetId: string, action: string) => {
  if (currentUser._id.toString() === targetId.toString()) {
    throw new Error(`You cannot ${action} your own account via this route.`);
  }
};

// ==========================================
// GET ME (Current User Profile)
// ==========================================
export const me = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new Error('Not authenticated');
    return httpResponse(req, res, 200, 'Profile fetched successfully', req.user);
  } catch (error: unknown) {
    return httpError(next, error, req, 401);
  }
};

// ==========================================
// UPDATE ME (Self Profile Completion)
// ==========================================
export const updateMe = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!req.user) throw new Error('Not authenticated');

    // We strictly extract ONLY safe fields.
    // Phone changes must go through a future Send/Verify OTP flow.
    const { name, email } = req.body;

    const userToUpdate = await User.findById(req.user._id).session(session);
    if (!userToUpdate) throw new Error('User not found');

    if (name !== undefined) userToUpdate.name = name;
    if (email !== undefined) userToUpdate.email = email;

    await userToUpdate.save({ session });
    await session.commitTransaction();

    const userResponse = userToUpdate.toObject();
    delete userResponse.passwordHash;

    return httpResponse(req, res, 200, 'Profile updated successfully', userResponse);
  } catch (error: unknown) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};
// ==========================================
// CREATE STAFF / ADMIN (Requires Password)
// ==========================================
export const createStaff = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { phone, name, email, role, password } = req.body;

    const existingUser = await User.findOne({ phone }).session(session);
    if (existingUser) {
      await session.abortTransaction();
      const statusCode = existingUser.role === 'customer' ? 409 : 400;
      return httpError(
        next,
        new Error(`User with this phone number already exists as ${existingUser.role}`),
        req,
        statusCode
      );
    }

    const newUser = new User({
      phone,
      name,
      email,
      role,
      passwordHash: password,
    });

    await newUser.save({ session });
    await session.commitTransaction();

    const userResponse = newUser.toObject();
    delete userResponse.passwordHash;

    return httpResponse(req, res, 201, `${role} created successfully`, userResponse);
  } catch (error: unknown) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// GET ALL USERS (With Pagination & Filters)
// ==========================================
export const getAllUsers = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // 1. Pagination Setup
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // 2. Filter Setup
    const filter: any = {};
    if (typeof req.query.role === 'string') {
      const roles = req.query.role.split(',').map((r) => r.trim());
      filter.role = roles.length > 1 ? { $in: roles } : roles[0];
    }
    if (req.query.isActive !== undefined) {
      filter.isActive = req.query.isActive === 'true';
    }
    if (typeof req.query.search === 'string') {
      const search = req.query.search;
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    // 3. Execute Query
    const users = await User.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments(filter);

    return httpResponse(req, res, 200, 'Users fetched successfully', {
      users,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: unknown) {
    return httpError(next, error, req, 500);
  }
};

// ==========================================
// GET ALL CUSTOMERS (With Orders & Spend Info)
// ==========================================
export const getAllCustomers = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const location = typeof req.query.location === 'string' ? req.query.location : undefined;
    const fromDate = typeof req.query.fromDate === 'string' ? req.query.fromDate : undefined;
    const toDate = typeof req.query.toDate === 'string' ? req.query.toDate : undefined;
    const sortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy : undefined;

    const pipeline: PipelineStage[] = [{ $match: { role: 'customer' } }];

    // 1. Search filter (Name or Phone)
    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { phone: { $regex: search, $options: 'i' } },
          ],
        },
      });
    }

    // 2. Date range filter (Registration Date)
    if (fromDate || toDate) {
      const dateFilter: Record<string, Date> = {};
      if (fromDate) {
        const d = new Date(fromDate);
        if (!isNaN(d.getTime())) dateFilter.$gte = d;
      }
      if (toDate) {
        const d = new Date(toDate);
        if (!isNaN(d.getTime())) {
          d.setHours(23, 59, 59, 999);
          dateFilter.$lte = d;
        }
      }
      if (Object.keys(dateFilter).length > 0) {
        pipeline.push({ $match: { createdAt: dateFilter } });
      }
    }

    // 3. Lookup Orders to calculate total spend and total orders
    pipeline.push({
      $lookup: {
        from: 'orders',
        localField: '_id',
        foreignField: 'userId',
        as: 'orders',
      },
    });

    // 4. Lookup Addresses (Take the default or most recent one)
    pipeline.push({
      $lookup: {
        from: 'addresses',
        let: { userId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$userId', '$$userId'] } } },
          { $sort: { isDefault: -1, createdAt: -1 } },
          { $limit: 1 },
        ],
        as: 'address',
      },
    });

    // 5. Calculate metrics and extract location
    pipeline.push({
      $addFields: {
        totalOrders: { $size: '$orders' },
        totalSpend: { $sum: '$orders.totalAmount' },
        locationData: { $arrayElemAt: ['$address', 0] },
      },
    });

    // 6. Location filter (City or State)
    if (location && location !== 'All Locations') {
      pipeline.push({
        $match: {
          $or: [
            { 'locationData.city': { $regex: location, $options: 'i' } },
            { 'locationData.state': { $regex: location, $options: 'i' } },
          ],
        },
      });
    }

    // 7. Sorting
    let sortStage: Record<string, 1 | -1> = { createdAt: -1 }; // Default: Newest First
    if (sortBy === 'oldest') sortStage = { createdAt: 1 };
    if (sortBy === 'name_asc') sortStage = { name: 1 };
    if (sortBy === 'name_desc') sortStage = { name: -1 };
    pipeline.push({ $sort: sortStage });

    // 8. Count for pagination (using facet to get count and data in one go)
    pipeline.push({
      $facet: {
        metadata: [{ $count: 'total' }],
        data: [
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              name: { $ifNull: ['$name', 'Customer'] },
              phone: 1,
              isActive: 1,
              createdAt: 1,
              totalOrders: 1,
              totalSpend: 1,
              location: {
                $cond: {
                  if: { $and: [{ $gt: [{ $type: '$locationData' }, 'missing'] }, { $ne: ['$locationData', null] }] },
                  then: {
                    $concat: [
                      { $ifNull: ['$locationData.city', 'Unknown City'] },
                      ', ',
                      { $ifNull: ['$locationData.state', 'Unknown State'] },
                    ],
                  },
                  else: 'Not Provided',
                },
              },
            },
          },
        ],
      },
    });

    const [result] = await User.aggregate(pipeline);

    const total = result.metadata[0]?.total || 0;
    const customers = result.data;

    return httpResponse(req, res, 200, 'Customers fetched successfully', {
      customers,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: unknown) {
    return httpError(next, error, req, 500);
  }
};

// ==========================================
// GET USER BY ID
// ==========================================
export const getUserById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) throw new Error('User not found');

    return httpResponse(req, res, 200, 'User fetched successfully', user);
  } catch (error: unknown) {
    return httpError(next, error, req, 404);
  }
};

// ==========================================
// UPDATE USER (Admin / Staff Only)
// ==========================================
export const updateUser = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    const { name, email, phone, role, password } = req.body;

    // 1. Check if user exists
    const userToUpdate = await User.findById(id).session(session);
    if (!userToUpdate) throw new Error('User not found');

    let isPasswordChanged = false;

    // 2. Handle Upgrades (Customer -> Staff/Admin)
    if (userToUpdate.role === 'customer' && (role === 'staff' || role === 'admin')) {
      const finalName = name || userToUpdate.name;
      if (!finalName) {
        throw new Error('A name is required when upgrading a customer to staff or admin.');
      }

      if (!password) {
        throw new Error('A password is required when upgrading a customer to staff or admin.');
      }
    }

    if (name !== undefined) userToUpdate.name = name;
    if (email !== undefined) userToUpdate.email = email;
    if (phone !== undefined) userToUpdate.phone = phone;
    if (role !== undefined) userToUpdate.role = role;

    if (password) {
      userToUpdate.passwordHash = password;
      isPasswordChanged = true;
    }

    await userToUpdate.save({ session });
    await session.commitTransaction();

    const userResponse = userToUpdate.toObject();
    delete userResponse.passwordHash;

    return httpResponse(req, res, 200, 'User updated successfully', {
      user: userResponse,
      isPasswordChanged,
    });
  } catch (error: unknown) {
    await session.abortTransaction();

    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
      return httpError(
        next,
        new Error('Email or Phone number is already in use by another account'),
        req,
        400
      );
    }

    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// TOGGLE STATUS (Soft Delete + Kick out)
// ==========================================
export const toggleUserStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    if (!id || Array.isArray(id)) {
      return httpError(next, new Error('Invalid request'), req, 400);
    }

    if (!req.user) throw new Error('Not authenticated');
    preventSelfAction(req.user, id, 'disable/enable');

    const user = await User.findById(id).session(session);
    if (!user) throw new Error('User not found');

    user.isActive = !user.isActive;
    await user.save({ session });

    if (!user.isActive) {
      await RefreshToken.deleteMany({ userId: user._id }).session(session);
    }

    await session.commitTransaction();
    return httpResponse(req, res, 200, `User is now ${user.isActive ? 'Active' : 'Disabled'}`);
  } catch (error: unknown) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// DELETE USER (Hard Delete)
// ==========================================
export const deleteUser = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    if (!id || Array.isArray(id)) {
      return httpError(next, new Error('Invalid request'), req, 400);
    }

    if (!req.user) throw new Error('Not authenticated');
    preventSelfAction(req.user, id, 'delete');

    const deletedUser = await User.findByIdAndDelete(id).session(session);
    if (!deletedUser) throw new Error('User not found');

    await RefreshToken.deleteMany({ userId: id }).session(session);

    await session.commitTransaction();
    return httpResponse(req, res, 200, 'User permanently deleted');
  } catch (error: unknown) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// UPDATE PUSH TOKEN
// ==========================================
export const updatePushToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { pushToken } = req.body;
    if (!req.user?._id) {
      throw new Error('Not authenticated');
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { pushToken } },
      { new: true }
    );

    if (!user) {
      throw new Error('User not found');
    }

    return httpResponse(req, res, 200, 'Push token updated successfully');
  } catch (error: unknown) {
    return httpError(next, error, req, 400);
  }
};
