import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { User } from '@/api/v1/models/user.model';
import { RefreshToken } from '@/api/v1/models/refreshToken.model';
import { httpError } from '@/api/v1/utils/httpError';
import httpResponse from '@/api/v1/utils/httpResponse';
import { AuthRequest, ILoginResponse, IRefreshResponse } from '@/api/v1/interfaces/auth.interface';
import env from '@/config/env';
import { Otp } from '../models/otp.model';
import { waBridgeService } from '@/api/v1/services/waBridge.service';
import { getCookieOptions, getLogoutCookieOptions } from '../utils/cookie';

// ==========================================
// HELPER: GENERATE TOKENS & SAVE SESSION
// ==========================================
const generateAuthSession = async (
  userId: mongoose.Types.ObjectId,
  role: string,
  authMethod: 'otp' | 'password',
  deviceInfo: string,
  session: mongoose.ClientSession
) => {
  const accessToken = jwt.sign(
    { id: userId, role: role, authMethod },
    env.JWT_TOKEN_SECRET,
    {
      expiresIn: '15m',
    }
  );

  const plainRefreshToken = crypto.randomBytes(40).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(plainRefreshToken).digest('hex');

  const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 Days

  const newSession = new RefreshToken({
    userId,
    tokenHash,
    expiresAt,
    deviceInfo,
    authMethod,
  });

  await newSession.save({ session });

  return { accessToken, plainRefreshToken };
};

// ==========================================
// SEND OTP: LOGIN
// ==========================================
export const sendOtpLogin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { phone } = req.body;
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await Otp.create({
      phone,
      otp,
      type: 'login',
    });

    try {
      await waBridgeService.sendOtpTemplate(phone, otp);
      console.log(`[WABridge] Login OTP ${otp} sent to ${phone}`);
    } catch (waError) {
      console.warn(`[WABridge] Failed for ${phone}. Falling back to SMS.\n${waError}`);
      return httpError(next, new Error('Sorry, We cant send the otp at this moment.'), req, 500);
    }

    return httpResponse(req, res, 200, 'OTP sent successfully');
  } catch (error: unknown) {
    return httpError(next, error, req, 500);
  }
};

// ==========================================
// SEND OTP: MOBILE CHANGE
// ==========================================
export const sendOtpMobileChange = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { newPhone } = req.body;

    const existingUser = await User.findOne({ phone: newPhone });
    if (existingUser) throw new Error('Phone number already in use');

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await Otp.create({
      phone: newPhone,
      otp,
      type: 'mobile_change',
    });

    try {
      await waBridgeService.sendOtpTemplate(newPhone, otp);
      console.log(`[WABridge] Mobile Change OTP ${otp} sent to ${newPhone}`);
    } catch (waError) {
      console.warn(`[WABridge] Failed for ${newPhone}.\n${waError}`);
      return httpError(next, new Error('Sorry, We cant send the otp at this moment.'), req, 500);
    }

    return httpResponse(req, res, 200, 'OTP sent successfully');
  } catch (error: unknown) {
    return httpError(next, error, req, 500);
  }
};

// ==========================================
// VERIFY OTP & LOGIN (Auto-Signup for Customers)
// ==========================================
export const verifyOtpLogin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { phone, otp, deviceInfo = 'Unknown Device' } = req.body;

    const otpRecord = await Otp.findOne({ phone, type: 'login' }).sort({ createdAt: -1 });
    if (!otpRecord) throw new Error('OTP not found or expired');

    const isValid = await otpRecord.compareOtp(otp);
    if (!isValid) throw new Error('Invalid OTP');

    await Otp.findByIdAndDelete(otpRecord._id).session(session);

    let user = await User.findOne({ phone }).session(session);
    let isNewUser = false;

    if (!user) {
      user = new User({
        phone,
        role: 'customer',
      });
      await user.save({ session });
      isNewUser = true;
    }

    if (!user.isActive) throw new Error('Account is disabled. Contact Admin.');

    const { accessToken, plainRefreshToken } = await generateAuthSession(
      user._id as mongoose.Types.ObjectId,
      user.role,
      'otp',
      deviceInfo,
      session
    );

    await session.commitTransaction();

    const userResponse = user.toObject();
    delete userResponse.passwordHash;

    const isMobile = req.headers['x-client-type'] === 'mobile';
    const responsePayload: ILoginResponse = {
      user: userResponse,
      accessToken,
      isNewUser,
    };

    if (isMobile) {
      responsePayload.refreshToken = plainRefreshToken;
    } else {
      res.cookie('customerRefreshToken', plainRefreshToken, getCookieOptions());
    }

    return httpResponse(req, res, 200, 'Login successful', responsePayload);
  } catch (error: unknown) {
    await session.abortTransaction();
    return httpError(next, error, req, 401);
  } finally {
    session.endSession();
  }
};

// ==========================================
// VERIFY OTP: MOBILE CHANGE
// ==========================================
export const verifyOtpMobileChange = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { newPhone, otp } = req.body;
    if (!req.user) throw new Error('Not authenticated');

    const otpRecord = await Otp.findOne({ phone: newPhone, type: 'mobile_change' }).sort({
      createdAt: -1,
    });
    if (!otpRecord) throw new Error('OTP not found or expired');

    const isValid = await otpRecord.compareOtp(otp);
    if (!isValid) throw new Error('Invalid OTP');

    await Otp.findByIdAndDelete(otpRecord._id).session(session);

    const user = await User.findById(req.user._id).session(session);
    if (!user) throw new Error('User not found');

    user.phone = newPhone;
    await user.save({ session });

    await session.commitTransaction();

    return httpResponse(req, res, 200, 'Phone number updated successfully');
  } catch (error: unknown) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// SEND OTP: DELETE ACCOUNT
// ==========================================
export const sendOtpDeleteAccount = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new Error('Not authenticated');
    const phone = req.user.phone;
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await Otp.create({
      phone,
      otp,
      type: 'account_deletion',
    });

    try {
      await waBridgeService.sendOtpTemplate(phone, otp);
      console.log(`[WABridge] Account Deletion OTP ${otp} sent to ${phone}`);
    } catch (waError) {
      console.warn(`[WABridge] Failed for ${phone}.\n${waError}`);
      return httpError(next, new Error('Sorry, We cant send the otp at this moment.'), req, 500);
    }

    return httpResponse(req, res, 200, 'OTP sent successfully');
  } catch (error: unknown) {
    return httpError(next, error, req, 500);
  }
};

// ==========================================
// VERIFY OTP: DELETE ACCOUNT
// ==========================================
export const verifyOtpDeleteAccount = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { otp } = req.body;
    if (!req.user) throw new Error('Not authenticated');
    const phone = req.user.phone;

    const otpRecord = await Otp.findOne({ phone, type: 'account_deletion' }).sort({
      createdAt: -1,
    });
    if (!otpRecord) throw new Error('OTP not found or expired');

    const isValid = await otpRecord.compareOtp(otp);
    if (!isValid) throw new Error('Invalid OTP');

    await Otp.findByIdAndDelete(otpRecord._id).session(session);

    // Perform hard delete of the user
    await User.findByIdAndDelete(req.user._id).session(session);

    // Delete all refresh tokens for this user
    await RefreshToken.deleteMany({ userId: req.user._id }).session(session);

    await session.commitTransaction();

    return httpResponse(req, res, 200, 'Account deleted successfully');
  } catch (error: unknown) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// LOGIN WITH PASSWORD (Staff/Admin Only)
// ==========================================
export const loginWithPassword = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { phone, password, deviceInfo = 'Unknown Device' } = req.body;

    const user = await User.findOne({ phone }).select('+passwordHash').session(session);

    if (!user) throw new Error('Invalid credentials');
    if (!user.isActive) throw new Error('Account is disabled. Contact Admin.');
    if (user.role === 'customer') throw new Error('Customers must login via OTP');

    const isMatch = await user.comparePassword(password);
    if (!isMatch) throw new Error('Invalid credentials');

    const { accessToken, plainRefreshToken } = await generateAuthSession(
      user._id as mongoose.Types.ObjectId,
      user.role,
      'password',
      deviceInfo,
      session
    );

    await session.commitTransaction();

    const userResponse = user.toObject();
    delete userResponse.passwordHash;

    const isMobile = req.headers['x-client-type'] === 'mobile';
    const responsePayload: ILoginResponse = {
      user: userResponse,
      accessToken,
    };

    if (isMobile) {
      responsePayload.refreshToken = plainRefreshToken;
    } else {
      res.cookie('adminRefreshToken', plainRefreshToken, getCookieOptions());
    }

    return httpResponse(req, res, 200, 'Login successful', responsePayload);
  } catch (error: unknown) {
    await session.abortTransaction();
    return httpError(next, error, req, 401);
  } finally {
    session.endSession();
  }
};

// ==========================================
// REFRESH TOKEN
// ==========================================
export const refreshToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const isMobile = req.headers['x-client-type'] === 'mobile';
    const { deviceInfo = 'Unknown Device', tokenType } = req.body;

    let tokenToRefresh = isMobile ? req.body.refreshToken : null;

    if (!isMobile) {
      if (tokenType === 'admin') {
        tokenToRefresh = req.cookies?.adminRefreshToken;
      } else if (tokenType === 'customer') {
        tokenToRefresh = req.cookies?.customerRefreshToken;
      } else {
        // Fallback to existing behavior if no tokenType is provided
        tokenToRefresh = req.cookies?.customerRefreshToken || req.cookies?.adminRefreshToken;
      }
    }

    if (!tokenToRefresh) {
      throw new Error(
        `Refresh token missing from ${isMobile ? 'body' : 'cookies'}${
          tokenType ? ` for ${tokenType}` : ''
        }`
      );
    }

    const tokenHash = crypto.createHash('sha256').update(tokenToRefresh).digest('hex');
    
    // GRACE PERIOD: Increased to 120 seconds to prevent race conditions 
    // when multiple concurrent requests trigger refresh simultaneously.
    const existingSession = await RefreshToken.findOneAndUpdate(
      { 
        tokenHash,
        expiresAt: { $gt: new Date() } 
      },
      { 
        expiresAt: new Date(Date.now() + 120000) 
      }
    ).session(session);

    if (!existingSession) {
      // Security Lockdown: If a token is reused after its grace period, revoke all sessions
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const expiredToken = authHeader.split(' ')[1];
        try {
          const decoded = jwt.verify(expiredToken, env.JWT_TOKEN_SECRET) as {
            id: string;
          };
          if (decoded && decoded.id) {
            await RefreshToken.deleteMany({ userId: decoded.id }).session(session);
            console.warn(
              `[SECURITY] Token reuse detected. All sessions revoked for ${decoded.id}.`
            );
          }
        } catch {
          // Token couldn't be decoded or verified, skip lockdown
        }
      }
      throw new Error('Invalid or compromised refresh token. Please log in again.');
    }

    const originalAuthMethod = existingSession.authMethod || 'otp';

    const user = await User.findById(existingSession.userId).session(session);
    if (!user || !user.isActive) throw new Error('User account is inactive or deleted');

    const { accessToken: newAccessToken, plainRefreshToken: newRefreshToken } =
      await generateAuthSession(
        user._id as mongoose.Types.ObjectId,
        user.role,
        originalAuthMethod,
        deviceInfo,
        session
      );

    await session.commitTransaction();

    const userResponse = user.toObject();
    delete userResponse.passwordHash;

    const responsePayload: IRefreshResponse = { 
      accessToken: newAccessToken,
      user: userResponse 
    };

    if (isMobile) {
      responsePayload.refreshToken = newRefreshToken;
    } else {
      const cookieName =
        originalAuthMethod === 'password' ? 'adminRefreshToken' : 'customerRefreshToken';

      res.cookie(cookieName, newRefreshToken, getCookieOptions());
    }

    return httpResponse(req, res, 200, 'Token refreshed successfully', responsePayload);
  } catch (error: unknown) {
    console.error(`[Refresh Error]: ${error instanceof Error ? error.message : error}`);
    await session.abortTransaction();
    return httpError(next, error, req, 403);
  } finally {
    session.endSession();
  }
};

// ==========================================
// LOGOUT (Revoke Current Device)
// ==========================================
export const logout = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const isMobile = req.headers['x-client-type'] === 'mobile';
    const tokensToRevoke: string[] = [];

    if (isMobile) {
      if (req.body.refreshToken) {
        tokensToRevoke.push(req.body.refreshToken);
      }
    } else {
      if (req.cookies?.customerRefreshToken) {
        tokensToRevoke.push(req.cookies.customerRefreshToken);
      }
      if (req.cookies?.adminRefreshToken) {
        tokensToRevoke.push(req.cookies.adminRefreshToken);
      }
    }

    if (tokensToRevoke.length > 0) {
      const hashes = tokensToRevoke.map((token) =>
        crypto.createHash('sha256').update(token).digest('hex')
      );
      await RefreshToken.deleteMany({ tokenHash: { $in: hashes } });
    }

    if (!isMobile) {
      res.clearCookie('customerRefreshToken', getLogoutCookieOptions());
      res.clearCookie('adminRefreshToken', getLogoutCookieOptions());
    }

    return httpResponse(req, res, 200, 'Logged out successfully');
  } catch (error: unknown) {
    return httpError(next, error, req, 500);
  }
};

// ==========================================
// LOGOUT ALL DEVICES
// ==========================================
export const logoutAllDevices = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!req.user) throw new Error('Not authenticated');

    const user = await User.findById(req.user._id).session(session);
    if (user) {
      user.tokensRevokedAt = new Date();
      await user.save({ session });
    }

    await RefreshToken.deleteMany({ userId: req.user._id }).session(session);

    const isMobile = req.headers['x-client-type'] === 'mobile';
    if (!isMobile) {
      res.clearCookie('customerRefreshToken', getLogoutCookieOptions());
      res.clearCookie('adminRefreshToken', getLogoutCookieOptions());
    }

    await session.commitTransaction();
    return httpResponse(req, res, 200, 'Successfully logged out of all devices');
  } catch (error: unknown) {
    await session.abortTransaction();
    return httpError(next, error, req, 500);
  } finally {
    session.endSession();
  }
};

// ==========================================
// GET ACTIVE SESSIONS
// ==========================================
export const getActiveSessions = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new Error('Not authenticated');

    const sessions = await RefreshToken.find({ userId: req.user._id })
      .select('-tokenHash')
      .sort({ createdAt: -1 });

    return httpResponse(req, res, 200, 'Active sessions fetched successfully', sessions);
  } catch (error: unknown) {
    return httpError(next, error, req, 500);
  }
};

// ==========================================
// REVOKE SINGLE SESSION
// ==========================================
export const revokeSingleSession = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { sessionId } = req.params;
    if (!req.user) throw new Error('Not authenticated');

    const deletedSession = await RefreshToken.findOneAndDelete({
      _id: sessionId,
      userId: req.user._id,
    }).session(session);

    if (!deletedSession) throw new Error('Session not found or already revoked');

    await session.commitTransaction();
    return httpResponse(req, res, 200, 'Device session revoked successfully');
  } catch (error: unknown) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// ADMIN: LOGOUT TARGET USER FROM ALL DEVICES
// ==========================================
export const adminLogoutTargetUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const targetUserId = req.params.id;

    if (req.user && req.user._id.toString() === targetUserId) {
      throw new Error('Use the standard /auth/logout-all route to log yourself out');
    }

    const targetUser = await User.findById(targetUserId).session(session);
    if (targetUser) {
      targetUser.tokensRevokedAt = new Date();
      await targetUser.save({ session });
    }

    const deleted = await RefreshToken.deleteMany({ userId: targetUserId }).session(session);

    if (deleted.deletedCount === 0) {
      await session.commitTransaction();
      return httpResponse(req, res, 200, 'User had no active sessions to revoke');
    }

    await session.commitTransaction();
    return httpResponse(req, res, 200, 'Successfully logged the target user out of all devices');
  } catch (error: unknown) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};
