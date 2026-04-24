import jwt from 'jsonwebtoken';
import { Secret, SignOptions } from 'jsonwebtoken';

// 🛡️ NUCLEAR FIX: We explicitly tell TypeScript "This is a Secret" and "This is a string"
// This prevents the "Overload" errors completely.
const JWT_SECRET = (process.env.JWT_SECRET || 'default_secret_fallback') as Secret;
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '7d') as string;

export const generateToken = (payload: any): string => {
  // We define options separately to ensure types match
  const options = { expiresIn: JWT_EXPIRES_IN } as SignOptions;
  return jwt.sign(payload, JWT_SECRET, options);
};

export const verifyToken = (token: string): any => {
  return jwt.verify(token, JWT_SECRET);
};
