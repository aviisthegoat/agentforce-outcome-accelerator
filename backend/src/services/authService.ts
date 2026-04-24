import pool from '../config/database.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { generateToken } from '../utils/jwt.js';
import { RegisterRequest, LoginRequest, User } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';

export async function registerUser(data: RegisterRequest): Promise<{ user: Omit<User, 'password_hash'>; token: string }> {
  const { username, password, email } = data;

  // Check if username already exists
  const existingUser = await pool.query(
    'SELECT id FROM users WHERE username = $1',
    [username]
  );

  if (existingUser.rows.length > 0) {
    throw new Error('Username already exists');
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Create user
  const id = uuidv4();
  const result = await pool.query(
    `INSERT INTO users (id, username, email, password_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id, username, email, is_admin, created_at, updated_at`,
    [id, username, email || null, passwordHash]
  );

  const user = result.rows[0];

  // Generate token
  const token = generateToken({ userId: user.id, username: user.username });

  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      is_admin: user.is_admin === true || user.is_admin === 'true' || user.is_admin === 1,
      created_at: user.created_at,
      updated_at: user.updated_at,
    },
    token,
  };
}

export async function loginUser(data: LoginRequest): Promise<{ user: Omit<User, 'password_hash'>; token: string }> {
  const { username, password } = data;

  // Find user by username
  const result = await pool.query(
    'SELECT id, username, email, password_hash, is_admin, created_at, updated_at FROM users WHERE username = $1',
    [username]
  );

  if (result.rows.length === 0) {
    throw new Error('Invalid username or password');
  }

  const user = result.rows[0];

  // Verify password
  const isValid = await comparePassword(password, user.password_hash);

  if (!isValid) {
    throw new Error('Invalid username or password');
  }

  // Generate token
  const token = generateToken({ userId: user.id, username: user.username });

  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      is_admin: user.is_admin === true || user.is_admin === 'true' || user.is_admin === 1,
      created_at: user.created_at,
      updated_at: user.updated_at,
    },
    token,
  };
}
