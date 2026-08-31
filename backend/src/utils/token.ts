import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AuthUser } from '../middleware/auth';

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateRandomToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function generateAccessToken(payload: AuthUser): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '15m' });
}
