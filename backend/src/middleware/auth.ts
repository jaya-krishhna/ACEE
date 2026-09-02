import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { UnauthorizedError, ForbiddenError } from '../errors/AppError';

export interface AuthUser {
  id: string;
  role: 'student' | 'organizer';
  organizationId?: string;
  membershipRole?: 'owner' | 'member';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Unauthorized: Missing or invalid token format'));
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as AuthUser;
    req.user = decoded;
    next();
  } catch (error) {
    return next(new UnauthorizedError('Unauthorized: Invalid or expired access token'));
  }
}

export function requireRole(...roles: ('student' | 'organizer')[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Unauthorized'));
    }
    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError('Forbidden: Insufficient permissions'));
    }
    next();
  };
}
