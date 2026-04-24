import pool from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

async function setAdmin() {
  const username = process.argv[2];
  
  if (!username) {
    console.error('Usage: tsx src/migrations/setAdmin.ts <username>');
    process.exit(1);
  }

  try {
    const result = await pool.query(
      'UPDATE users SET is_admin = TRUE WHERE username = $1 RETURNING id, username, is_admin',
      [username]
    );

    if (result.rows.length === 0) {
      console.error(`❌ User "${username}" not found`);
      process.exit(1);
    }

    console.log(`✅ User "${username}" is now an admin`);
    console.log('User details:', result.rows[0]);
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Failed to set admin:', error.message);
    process.exit(1);
  }
}

setAdmin();


