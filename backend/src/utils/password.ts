import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  if (!password || typeof password !== 'string' || password.length === 0) {
    throw new Error('Password must be a non-empty string');
  }

  try {
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    
    if (!hash || hash.length === 0) {
      throw new Error('Password hashing failed: empty hash returned');
    }
    
    return hash;
  } catch (error: any) {
    console.error('Error hashing password:', error);
    throw new Error(`Password hashing failed: ${error.message}`);
  }
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  if (!password || typeof password !== 'string' || password.length === 0) {
    throw new Error('Password must be a non-empty string');
  }

  if (!hash || typeof hash !== 'string' || hash.length === 0) {
    throw new Error('Hash must be a non-empty string');
  }

  try {
    return await bcrypt.compare(password, hash);
  } catch (error: any) {
    console.error('Error comparing password:', error);
    throw new Error(`Password comparison failed: ${error.message}`);
  }
}

