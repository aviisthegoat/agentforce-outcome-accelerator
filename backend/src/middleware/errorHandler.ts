import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const errAny = err as Error & { code?: string; detail?: string };
  console.error('Error:', err.message);
  console.error('Error stack:', err.stack);
  if (errAny.code) console.error('PG code:', errAny.code);
  if (errAny.detail) console.error('PG detail:', errAny.detail);

  if (err.message === 'Invalid or expired token') {
    return res.status(403).json({ error: err.message });
  }

  if (err.message.includes('duplicate key')) {
    return res.status(409).json({ error: 'Resource already exists' });
  }

  // Foreign key violation (e.g. user_id not in users) → 404 so client can show "User not found" / re-login
  if (errAny.code === '23503') {
    return res.status(404).json({
      error: 'User not found',
      message: 'Your account may have been removed. Please sign in again.',
    });
  }

  // Invalid UUID / bad input syntax for type uuid → 400
  if (errAny.code === '22P02') {
    return res.status(400).json({
      error: 'Invalid request',
      message: 'Invalid user or request data. Please sign in again.',
    });
  }

  // Missing column (e.g. old DB schema) → ask to run migrations
  if (errAny.code === '42703') {
    return res.status(500).json({
      error: 'Database schema is out of date',
      message: 'A required column is missing. Run migrations: cd backend && npm run migrate',
    });
  }

  // Database connection / setup errors → return a clear message so the UI can show it
  const dbHint =
    errAny.code === 'ECONNREFUSED' || errAny.code === 'ENOTFOUND'
      ? ' Database is not running or connection settings are wrong. See SETUP_DATABASE.md.'
      : errAny.code === '28P01'
        ? ' Invalid database credentials. Check DB_USER/DB_PASSWORD (or DATABASE_URL).'
        : errAny.code === '3D000'
          ? ' Database does not exist. Create it (e.g. createdb persona_builder) and run migrations.'
          : errAny.code === '42P01'
            ? ' A required table is missing. Run: cd backend && npm run migrate'
            : '';

  const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
  const userMessage = dbHint ? `Internal server error.${dbHint}` : 'Internal server error';
  const primaryMessage = err.message || userMessage;

  res.status(500).json({
    error: primaryMessage,
    message: err.message,
    ...(errAny.code && { code: errAny.code }),
    ...(errAny.detail && { detail: errAny.detail }),
    ...(isDevelopment && { stack: err.stack }),
  });
}

