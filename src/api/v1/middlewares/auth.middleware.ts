import { type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '@/api/v1/models/user.model';
import { type AuthRequest } from '@/api/v1/interfaces/auth.interface';
import { httpError } from '@/api/v1/utils/httpError';
import env from '@/config/env';

interface JwtPayload {
  id: string;
  role: 'customer' | 'staff' | 'admin';
  authMethod: 'otp' | 'password';
  iat?: number;
}

export const protect = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      console.log(`in auth not toekn provodeed`)
      return httpError(
        next,
        new Error('Not authorized to access this route. No token provided.'),
        req,
        401
      );
    }

    const decoded = jwt.verify(token, env.JWT_TOKEN_SECRET as string) as JwtPayload;

    const user = await User.findById(decoded.id);

    if (!user) {
      return httpError(
        next,
        new Error('The user belonging to this token no longer exists.'),
        req,
        401
      );
    }

    if (!user.isActive) {
      return httpError(next, new Error('Account is disabled. Contact Admin.'), req, 403);
    }

    if (user.tokensRevokedAt && decoded.iat) {
      const issuedAtTimestamp = new Date(decoded.iat * 1000);

      if (issuedAtTimestamp < user.tokensRevokedAt) {
        return httpError(
          next,
          new Error('Your session has been terminated by an administrator. Please log in again.'),
          req,
          401
        );
      }
    }

    req.user = user;
    req.authMethod = decoded.authMethod;
    return next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return httpError(next, new Error('Token expired. Please refresh your token.'), req, 401);
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return httpError(next, new Error('Invalid token. Please log in again.'), req, 401);
    }
    return httpError(next, error, req, 401);
  }
};

export const optionalProtect = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, env.JWT_TOKEN_SECRET as string) as JwtPayload;
    const user = await User.findById(decoded.id);

    if (user && user.isActive) {
      if (user.tokensRevokedAt && decoded.iat) {
        const issuedAtTimestamp = new Date(decoded.iat * 1000);
        if (issuedAtTimestamp >= user.tokensRevokedAt) {
          req.user = user;
          req.authMethod = decoded.authMethod;
        }
      } else {
        req.user = user;
        req.authMethod = decoded.authMethod;
      }
    }

    return next();
  } catch (error) {
    // If token is invalid or expired, just continue as guest
    return next();
  }
};

// ==========================================
// ROLE RESTRICTION (Guard specific routes)
// ==========================================
export const restrictTo = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    // Ensure req.user exists (protect middleware must run before this)
    if (!req.user) {
      return httpError(next, new Error('Not authenticated'), req, 401);
    }

    // Check if the user's role is in the array of allowed roles
    if (!roles.includes(req.user.role)) {
      return httpError(
        next,
        new Error(`Forbidden: Role '${req.user.role}' is not allowed to perform this action.`),
        req,
        403
      );
    }

    const requiresElevatedAccess = roles.includes('admin') || roles.includes('staff');

    if (requiresElevatedAccess && req.authMethod !== 'password') {
      return httpError(
        next,
        new Error('Elevated actions require a password login. Please log in via the admin portal.'),
        req,
        403
      );
    }

    return next();
  };
};
