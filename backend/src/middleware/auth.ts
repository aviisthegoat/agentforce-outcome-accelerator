import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt.js'; 

export interface AuthRequest extends Request {
  userId?: string;
  username?: string;
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    // 🔍 THE FIX: (verifyToken(token) as any)
    // This tells TypeScript "Trust me, the payload has the data I need"
    const payload = verifyToken(token) as any;
    
    req.userId = payload.userId;
    req.username = payload.username;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}
