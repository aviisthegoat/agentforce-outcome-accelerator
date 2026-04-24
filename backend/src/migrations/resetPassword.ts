import pool from '../config/database.js';
import { hashPassword } from '../utils/password.js';
import dotenv from 'dotenv';

dotenv.config();

async function resetPassword() {
  const username = process.argv[2];
  const newPassword = process.argv[3];
  
  if (!username || !newPassword) {
    console.error('Usage: tsx src/migrations/resetPassword.ts <username> <new_password>');
    console.error('Example: tsx src/migrations/resetPassword.ts admin newpassword123');
    process.exit(1);
  }

  try {
    // Check if user exists
    const userCheck = await pool.query(
      'SELECT id, username FROM users WHERE username = $1',
      [username]
    );

    if (userCheck.rows.length === 0) {
      console.error(`❌ User "${username}" not found`);
      process.exit(1);
    }

    // Hash new password
    const passwordHash = await hashPassword(newPassword);

    // Update password
    const result = await pool.query(
      `UPDATE users SET password_hash = $1 WHERE username = $2 RETURNING id, username, is_admin`,
      [passwordHash, username]
    );

    const user = result.rows[0];
    console.log(`✅ Password reset successfully for user "${username}"`);
    console.log('User details:', {
      id: user.id,
      username: user.username,
      is_admin: user.is_admin
    });
    console.log(`\n📝 New login credentials:`);
    console.log(`   Username: ${username}`);
    console.log(`   Password: ${newPassword}`);
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Failed to reset password:', error.message);
    process.exit(1);
  }
}

resetPassword();


